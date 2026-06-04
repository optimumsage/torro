import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { MediaInfo } from './ffmpeg.js';
import { cacheKey, THUMB_ROOT, ensureDir } from './mediaCache.js';
import { logger } from '../logger.js';

const THUMB_W = 160;
const THUMB_H = 90;
const COLS = 5;
const MAX_THUMBS = 150;

// Cap concurrent ffmpeg thumbnail jobs so loading a list of videos can't spike CPU.
const MAX_CONCURRENT = 2;
let active = 0;
const waiters: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}
function release(): void {
  active--;
  waiters.shift()?.();
}

async function run(args: string[], timeoutMs: number): Promise<boolean> {
  await acquire();
  try {
    return await new Promise<boolean>((resolve) => {
      const child = spawn('ffmpeg', args, { stdio: 'ignore' });
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
  } finally {
    release();
  }
}

// Dedupe concurrent generation of the same artifact.
const inflight = new Map<string, Promise<string | null>>();
function once(key: string, fn: () => Promise<string | null>): Promise<string | null> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const job = fn().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

// A single representative frame, cached.
export async function getPoster(filePath: string, info: MediaInfo): Promise<string | null> {
  const out = path.join(THUMB_ROOT, `${cacheKey(filePath)}.jpg`);
  if (fs.existsSync(out)) return out;
  return once(out, async () => {
    ensureDir(THUMB_ROOT);
    const seek = Math.min(Math.max(info.durationSec * 0.1, 1), 600);
    const tmp = `${out}.tmp.jpg`;
    const ok = await run(
      ['-nostdin', '-loglevel', 'error', '-y', '-ss', String(seek), '-i', filePath,
       '-frames:v', '1', '-vf', `scale=640:-2`, '-q:v', '4', tmp],
      20000
    );
    if (!ok) return null;
    fs.renameSync(tmp, out);
    return out;
  });
}

export interface StoryboardMeta {
  interval: number;
  count: number;
  cols: number;
  thumbW: number;
  thumbH: number;
}

export function storyboardMeta(info: MediaInfo): StoryboardMeta {
  const interval = Math.max(5, Math.ceil(info.durationSec / MAX_THUMBS));
  const count = Math.max(1, Math.floor(info.durationSec / interval) + 1);
  return { interval, count, cols: COLS, thumbW: THUMB_W, thumbH: THUMB_H };
}

export function spritePath(filePath: string): string {
  return path.join(THUMB_ROOT, `${cacheKey(filePath)}.sprite.jpg`);
}

// A sprite sheet of evenly-spaced frames, cached (decodes the whole file — lazy + one-time).
export async function getStoryboardSprite(filePath: string, info: MediaInfo): Promise<string | null> {
  const out = spritePath(filePath);
  if (fs.existsSync(out)) return out;
  return once(out, async () => {
    ensureDir(THUMB_ROOT);
    const { interval, count, cols } = storyboardMeta(info);
    const rows = Math.ceil(count / cols);
    const tmp = `${out}.tmp.jpg`;
    const ok = await run(
      ['-nostdin', '-loglevel', 'error', '-y', '-i', filePath,
       '-frames:v', '1',
       '-vf', `fps=1/${interval},scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease,pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2,tile=${cols}x${rows}`,
       '-q:v', '4', tmp],
      5 * 60 * 1000
    );
    if (!ok) {
      logger.debug({ filePath }, 'storyboard generation failed');
      return null;
    }
    fs.renameSync(tmp, out);
    return out;
  });
}

function ts(seconds: number): string {
  const s = Math.max(0, seconds);
  const hh = Math.floor(s / 3600).toString().padStart(2, '0');
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const ss = (s % 60).toFixed(3).padStart(6, '0');
  return `${hh}:${mm}:${ss}`;
}

// WebVTT storyboard referencing the sprite endpoint with media fragments (#xywh).
export function buildStoryboardVtt(encodedPath: string, info: MediaInfo): string {
  const { interval, count, cols, thumbW, thumbH } = storyboardMeta(info);
  const lines = ['WEBVTT', ''];
  for (let i = 0; i < count; i++) {
    const start = i * interval;
    const end = Math.min((i + 1) * interval, info.durationSec || (i + 1) * interval);
    const x = (i % cols) * thumbW;
    const y = Math.floor(i / cols) * thumbH;
    lines.push(`${ts(start)} --> ${ts(end)}`);
    lines.push(`sprite?path=${encodedPath}#xywh=${x},${y},${thumbW},${thumbH}`);
    lines.push('');
  }
  return lines.join('\n');
}
