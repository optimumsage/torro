import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { getDb } from '../db/index.js';
import { validateSession, SESSION_COOKIE } from '../auth/session.js';
import { getQbit } from '../services/qbit.js';
import { getDiskUsage } from '../services/disk.js';
import { env } from '../env.js';
import { logger } from '../logger.js';

const WS_PATH = '/api/torrents/progress/stream';
const PUSH_INTERVAL_MS = 2000;
const HEARTBEAT_MS = 30_000;

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

interface LiveSocket extends WebSocket {
  isAlive?: boolean;
}

export function setupProgressWs(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  let pushTimer: NodeJS.Timeout | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  async function broadcast(): Promise<void> {
    if (wss.clients.size === 0) return;
    let payload: string;
    try {
      const [torrents, disk] = await Promise.all([
        getQbit().getTorrents(),
        getDiskUsage(env.DOWNLOADS_PATH),
      ]);
      payload = JSON.stringify({ type: 'progress', torrents, disk });
    } catch (err) {
      logger.debug({ err }, 'Progress broadcast failed');
      payload = JSON.stringify({ type: 'error', message: 'Failed to fetch progress' });
    }
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  function startTimers(): void {
    if (!pushTimer) pushTimer = setInterval(() => void broadcast(), PUSH_INTERVAL_MS);
    if (!heartbeatTimer) {
      heartbeatTimer = setInterval(() => {
        for (const client of wss.clients as Set<LiveSocket>) {
          if (client.isAlive === false) {
            client.terminate();
            continue;
          }
          client.isAlive = false;
          client.ping();
        }
      }, HEARTBEAT_MS);
    }
  }

  function stopTimersIfIdle(): void {
    if (wss.clients.size > 0) return;
    if (pushTimer) clearInterval(pushTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    pushTimer = null;
    heartbeatTimer = null;
  }

  wss.on('connection', (ws: LiveSocket) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (raw) => {
      // The only inbound message is a client heartbeat ping.
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'ping' && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        /* ignore malformed frames */
      }
    });
    ws.on('close', stopTimersIfIdle);
    startTimers();
    void broadcast();
  });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== WS_PATH) return; // let other upgrade handlers (if any) deal with it

    const token = parseCookie(req.headers.cookie, SESSION_COOKIE);
    const session = token ? validateSession(getDb(), token, Date.now()) : null;
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
}
