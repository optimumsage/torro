import { describe, it, expect } from 'vitest';
import { isActive, isCompleted, isPaused, stateLabel } from './torrentState';
import type { Torrent } from '@/types';

const base: Torrent = {
  hash: 'x', name: 'n', state: 'downloading', progress: 0.5, size: 100, downloaded: 50,
  uploaded: 0, dlspeed: 10, upspeed: 0, eta: 60, num_seeds: 1, num_leechs: 1, ratio: 0,
  added_on: 0, completion_on: 0, save_path: '/downloads',
};

describe('torrentState', () => {
  it('classifies a downloading torrent as active', () => {
    expect(isActive(base)).toBe(true);
    expect(isCompleted(base)).toBe(false);
    expect(stateLabel(base).label).toBe('Downloading');
  });

  it('classifies progress=1 as completed', () => {
    const done = { ...base, progress: 1 };
    expect(isCompleted(done)).toBe(true);
    expect(stateLabel(done).tone).toBe('success');
  });

  it('detects paused states', () => {
    expect(isPaused({ ...base, state: 'pausedDL' })).toBe(true);
    expect(isPaused(base)).toBe(false);
  });

  it('treats seeding states as completed', () => {
    expect(isCompleted({ ...base, state: 'uploading', progress: 1 })).toBe(true);
  });
});
