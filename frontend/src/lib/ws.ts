export type WsState = 'connecting' | 'open' | 'reconnecting' | 'closed';

interface Options {
  url: string;
  onMessage: (data: unknown) => void;
  onStateChange?: (state: WsState) => void;
  onAuthError?: () => void;
}

// A resilient WebSocket: exponential backoff with jitter, heartbeat, and
// visibility-aware reconnect. Stops retrying on an auth failure (close code 4401).
export class ReconnectingSocket {
  private ws: WebSocket | null = null;
  private state: WsState = 'closed';
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private stopped = false;
  private openedAt = 0;

  private readonly base = 1000;
  private readonly cap = 30_000;
  private readonly heartbeatMs = 25_000;
  private readonly deadMs = 40_000;

  constructor(private opts: Options) {}

  start(): void {
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.setState('closed');
  }

  getState(): WsState {
    return this.state;
  }

  private setState(s: WsState): void {
    if (this.state === s) return;
    this.state = s;
    this.opts.onStateChange?.(s);
  }

  private connect(): void {
    if (this.stopped) return;
    this.setState(this.retries === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.openedAt = Date.now();
      this.lastMessageAt = Date.now();
      this.setState('open');
      this.startHeartbeat();
    };

    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      try {
        this.opts.onMessage(JSON.parse(ev.data));
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onclose = (ev) => {
      this.clearHeartbeat();
      this.ws = null;
      if (this.stopped) return;
      if (ev.code === 4401) {
        this.setState('closed');
        this.opts.onAuthError?.();
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will follow and handle reconnect.
      ws.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.setState('reconnecting');
    // Reset backoff if the last connection was healthy for a while.
    if (this.openedAt && Date.now() - this.openedAt > 5000) this.retries = 0;
    const delay = Math.min(this.cap, this.base * 2 ** this.retries);
    const jitter = delay * (0.5 + Math.random() * 0.5);
    this.retries += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), jitter);
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastMessageAt > this.deadMs) {
        this.ws.close();
        return;
      }
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }, this.heartbeatMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearHeartbeat();
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible' && (this.state === 'reconnecting' || this.state === 'closed')) {
      this.clearTimers();
      this.retries = 0;
      this.connect();
    }
  };
}

export function progressSocketUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/torrents/progress/stream`;
}
