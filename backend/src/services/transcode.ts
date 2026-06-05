import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { MediaInfo } from './ffmpeg.js';
import { cacheKey, HLS_ROOT, ensureDir } from './mediaCache.js';
import { logger } from './../logger.js';

const TARGET_SECONDS = 6;
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

export interface Segment {
  start: number;
  dur: number;
}
export interface SegmentPlan {
  copy: boolean; // stream-copy video (h264) vs transcode
  segments: Segment[];
  targetDuration: number;
}

const planCache = new Map<string, SegmentPlan>();

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, stdout });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout });
    });
  });
}

// Read keyframe timestamps (fast for indexed containers like MP4/MKV).
async function keyframeTimes(file: string): Promise<number[] | null> {
  const { ok, stdout } = await run(
    'ffprobe',
    ['-loglevel', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey',
     '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file],
    30000
  );
  if (!ok) return null;
  const times = stdout
    .split('\n')
    .map((l) => parseFloat(l))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  return times.length ? times : null;
}

// Group keyframes into >=TARGET-second, keyframe-aligned segments (so copy cuts are clean).
function planFromKeyframes(keyframes: number[], duration: number): Segment[] {
  const segs: Segment[] = [];
  let i = 0;
  const kf = keyframes[0] === 0 ? keyframes : [0, ...keyframes];
  while (i < kf.length) {
    const start = kf[i]!;
    let j = i + 1;
    while (j < kf.length && kf[j]! - start < TARGET_SECONDS) j++;
    const end = j < kf.length ? kf[j]! : duration;
    if (end - start > 0.1) segs.push({ start, dur: end - start });
    if (j >= kf.length) break;
    i = j;
  }
  return segs.length ? segs : [{ start: 0, dur: duration }];
}

function fixedPlan(duration: number): Segment[] {
  const segs: Segment[] = [];
  for (let t = 0; t < duration; t += TARGET_SECONDS) {
    segs.push({ start: t, dur: Math.min(TARGET_SECONDS, duration - t) });
  }
  return segs.length ? segs : [{ start: 0, dur: duration }];
}

export async function getPlan(file: string, info: MediaInfo): Promise<SegmentPlan> {
  const key = cacheKey(file);
  const cached = planCache.get(key);
  if (cached) return cached;

  const isH264 = info.videoCodec === 'h264';
  let segments: Segment[];
  if (isH264) {
    const kf = await keyframeTimes(file);
    segments = kf ? planFromKeyframes(kf, info.durationSec) : fixedPlan(info.durationSec);
  } else {
    segments = fixedPlan(info.durationSec); // transcode path snaps its own keyframes
  }
  const targetDuration = Math.ceil(Math.max(TARGET_SECONDS, ...segments.map((s) => s.dur)));
  const plan: SegmentPlan = { copy: isH264, segments, targetDuration };
  planCache.set(key, plan);
  return plan;
}

// Static VOD playlist → the player knows the full duration immediately and can seek anywhere.
export function buildVodPlaylist(encodedPath: string, plan: SegmentPlan): string {
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXT-X-TARGETDURATION:${plan.targetDuration}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-INDEPENDENT-SEGMENTS',
  ];
  plan.segments.forEach((s, i) => {
    lines.push(`#EXTINF:${s.dur.toFixed(3)},`);
    lines.push(`segment?path=${encodedPath}&i=${i}`);
  });
  lines.push('#EXT-X-ENDLIST');
  return lines.join('\n') + '\n';
}

function segmentArgs(file: string, seg: Segment, copy: boolean, out: string): string[] {
  const video = copy
    ? ['-c:v', 'copy']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
       '-force_key_frames', 'expr:gte(t,0)'];
  return [
    '-nostdin', '-loglevel', 'error', '-y',
    '-ss', String(seg.start),
    '-i', file,
    '-t', String(seg.dur),
    '-map', '0:v:0', '-map', '0:a:0?',
    ...video,
    '-c:a', 'aac', '-ac', '2', '-b:a', '160k',
    '-muxdelay', '0', '-muxpreload', '0',
    '-output_ts_offset', String(seg.start),
    '-f', 'mpegts',
    out,
  ];
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString().slice(0, 1500)));
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${stderr.slice(-300)}`));
    });
  });
}

// Produce (or reuse) segment `index`. Concurrent identical requests share the work.
export async function getSegment(file: string, info: MediaInfo, index: number): Promise<string | null> {
  const plan = await getPlan(file, info);
  const seg = plan.segments[index];
  if (!seg) return null;

  const key = cacheKey(file);
  const dir = path.join(HLS_ROOT, key);
  const out = path.join(dir, `${index}.ts`);
  if (fs.existsSync(out)) {
    fs.utimesSync(out, new Date(), new Date());
    return out;
  }

  const dedupe = `${key}:${index}`;
  const existing = inflight.get(dedupe);
  if (existing) return existing;

  const job = (async () => {
    ensureDir(dir);
    const tmp = `${out}.tmp`;
    await acquire();
    try {
      await ffmpeg(segmentArgs(file, seg, plan.copy, tmp));
      fs.renameSync(tmp, out);
      return out;
    } catch (err) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* ignore */
      }
      logger.debug({ err, index }, 'segment generation failed');
      throw err;
    } finally {
      release();
      inflight.delete(dedupe);
    }
  })();
  inflight.set(dedupe, job);
  return job;
}
