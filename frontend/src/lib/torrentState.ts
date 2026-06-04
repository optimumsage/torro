import type { Torrent } from '@/types';

const COMPLETED_STATES = new Set([
  'uploading', 'stalledUP', 'forcedUP', 'queuedUP', 'checkingUP', 'pausedUP', 'stoppedUP',
]);
const PAUSED_STATES = new Set(['pausedDL', 'stoppedDL', 'pausedUP', 'stoppedUP']);

export function isCompleted(t: Torrent): boolean {
  return COMPLETED_STATES.has(t.state) || t.progress === 1;
}

export function isPaused(t: Torrent): boolean {
  return PAUSED_STATES.has(t.state);
}

export function isActive(t: Torrent): boolean {
  return !isCompleted(t);
}

// Human label + tone for a qBittorrent state.
export function stateLabel(t: Torrent): { label: string; tone: 'default' | 'success' | 'warning' | 'muted' } {
  if (isCompleted(t)) return { label: 'Completed', tone: 'success' };
  switch (t.state) {
    case 'downloading':
    case 'forcedDL':
      return { label: 'Downloading', tone: 'default' };
    case 'metaDL':
      return { label: 'Fetching metadata', tone: 'warning' };
    case 'stalledDL':
      return { label: 'Stalled', tone: 'warning' };
    case 'pausedDL':
    case 'stoppedDL':
      return { label: 'Paused', tone: 'muted' };
    case 'queuedDL':
      return { label: 'Queued', tone: 'muted' };
    case 'checkingDL':
    case 'checkingResumeData':
      return { label: 'Checking', tone: 'warning' };
    case 'error':
    case 'missingFiles':
      return { label: 'Error', tone: 'warning' };
    default:
      return { label: t.state, tone: 'default' };
  }
}
