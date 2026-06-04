import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReconnectingSocket } from './ws';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.onclose?.({ code: 1000 });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ReconnectingSocket', () => {
  it('transitions connecting -> open and parses messages', () => {
    const states: string[] = [];
    const messages: unknown[] = [];
    const s = new ReconnectingSocket({
      url: 'ws://x',
      onStateChange: (st) => states.push(st),
      onMessage: (m) => messages.push(m),
    });
    s.start();
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    ws.onmessage?.({ data: JSON.stringify({ type: 'progress' }) });
    expect(states).toContain('connecting');
    expect(states).toContain('open');
    expect(messages).toEqual([{ type: 'progress' }]);
    s.stop();
  });

  it('reconnects after an unexpected close', () => {
    const s = new ReconnectingSocket({ url: 'ws://x', onMessage: () => {} });
    s.start();
    MockWebSocket.instances[0]!.onclose?.({ code: 1006 });
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(2000); // past the first backoff window
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    s.stop();
  });

  it('stops retrying and signals auth error on close code 4401', () => {
    const onAuthError = vi.fn();
    const s = new ReconnectingSocket({ url: 'ws://x', onMessage: () => {}, onAuthError });
    s.start();
    MockWebSocket.instances[0]!.onclose?.({ code: 4401 });
    vi.advanceTimersByTime(60000);
    expect(onAuthError).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances).toHaveLength(1);
    s.stop();
  });
});
