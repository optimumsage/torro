import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';

// Stable cache key for a file (downloads are immutable once complete).
export function cacheKey(filePath: string): string {
  return crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 16);
}

// Transient HLS segments live in tmp (regenerable, possibly large).
export const HLS_ROOT = path.join(os.tmpdir(), 'torro-hls');
// Posters/storyboards persist on the data volume (cheap to keep, expensive to rebuild).
export const THUMB_ROOT = path.join(env.DATA_DIR, 'thumbs');

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// Remove HLS session dirs not touched in `maxAgeMs` (called periodically).
export function pruneHlsCache(maxAgeMs = 2 * 60 * 60 * 1000): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(HLS_ROOT);
  } catch {
    return;
  }
  const cutoff = Date.now() - maxAgeMs;
  for (const name of entries) {
    const dir = path.join(HLS_ROOT, name);
    try {
      if (fs.statSync(dir).mtimeMs < cutoff) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
