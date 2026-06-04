import { useSyncExternalStore } from 'react';
import type { WsState } from './ws';

let state: WsState = 'closed';
const listeners = new Set<() => void>();

export function setWsState(s: WsState): void {
  if (state === s) return;
  state = s;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useWsState(): WsState {
  return useSyncExternalStore(subscribe, () => state);
}

export function isLive(): boolean {
  return state === 'open';
}
