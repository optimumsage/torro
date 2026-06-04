import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { MediaInfo } from './ffmpeg.js';
import { cacheKey, HLS_ROOT, ensureDir } from './mediaCache.js';
import { logger } from '../logger.js';

export const SEGMENT_SECONDS = 6;
const MAX_CONCURRENT = 3;

let active = 0;
const queue: Array<() => void> = [];
const inflight = new Map<string, Promise<string>>();

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function release(): void {
  active--;
  const next = queue.shift();
  if (next) {
    active++;
    next();
  }
}

export function segmentCount(info: MediaInfo): number {
  return Math.max(1, Math.ceil(info.durationSec / SEGMENT_SECONDS));
}

// Static VOD playlist covering the whole timeline → the player can seek anywhere,
// while segments are produced lazily on request.
export function buildPlaylist(encodedPath: string, info: MediaInfo): string {
  const count = segmentCount(info);
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXT-X-TARGETDURATION:${SEGMENT_SECONDS}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
  ];
  for (let i = 0; i < count; i++) {
    const dur = Math.min(SEGMENT_SECONDS, info.durationSec - i * SEGMENT_SECONDS) || SEGMENT_SECONDS;
    lines.push(`#EXTINF:${dur.toFixed(3)},`);
    lines.push(`segment?path=${encodedPath}&i=${i}`);
  }
  lines.push('#EXT-X-ENDLIST');
  return lines.join('\n') + '\n';
}

function ffmpegSegmentArgs(filePath: string, start: number, dur: number, outPath: string): string[] {
  // Transcode just this window to H.264/AAC. Input-seek (-ss before -i) is fast;
  // -output_ts_offset keeps timestamps continuous across segments so seeking maps cleanly.
  return [
    '-nostdin', '-loglevel', 'error', '-y',
    '-ss', String(start),
    '-i', filePath,
    '-t', String(dur),
    '-map', '0:v:0?',
    '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-force_key_frames', 'expr:gte(t,0)',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000',
    '-output_ts_offset', String(start),
    '-muxdelay', '0', '-muxpreload', '0',
    '-f', 'mpegts',
    outPath,
  ];
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString().slice(0, 2000)));
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
    });
  });
}

// Produce (or reuse) the .ts file for segment `index`. Concurrent identical requests share work.
export async function getSegment(filePath: string, index: number, info: MediaInfo): Promise<string> {
  const key = cacheKey(filePath);
  const dir = path.join(HLS_ROOT, key);
  const outPath = path.join(dir, `${index}.ts`);
  if (fs.existsSync(outPath)) {
    fs.utimesSync(outPath, new Date(), new Date()); // keep recently-used segments alive
    return outPath;
  }

  const dedupeKey = `${key}:${index}`;
  const existing = inflight.get(dedupeKey);
  if (existing) return existing;

  const job = (async () => {
    ensureDir(dir);
    const start = index * SEGMENT_SECONDS;
    const dur = Math.min(SEGMENT_SECONDS, info.durationSec - start) || SEGMENT_SECONDS;
    const tmp = `${outPath}.tmp`;
    await acquire();
    try {
      await runFfmpeg(ffmpegSegmentArgs(filePath, start, dur, tmp));
      fs.renameSync(tmp, outPath);
      return outPath;
    } catch (err) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* ignore */
      }
      logger.debug({ err, index }, 'segment transcode failed');
      throw err;
    } finally {
      release();
      inflight.delete(dedupeKey);
    }
  })();

  inflight.set(dedupeKey, job);
  return job;
}
