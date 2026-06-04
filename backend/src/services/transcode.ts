import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { MediaInfo } from './ffmpeg.js';
import { cacheKey, HLS_ROOT, ensureDir } from './mediaCache.js';
import { logger } from './../logger.js';

export const SEGMENT_SECONDS = 6;
const MAX_SESSIONS = 2;

interface Session {
  key: string;
  dir: string;
  playlist: string;
  proc: ChildProcess | null;
  done: boolean;
  error: boolean;
  startedAt: number;
}

const sessions = new Map<string, Session>();

function hasEndList(playlist: string): boolean {
  try {
    return fs.readFileSync(playlist, 'utf8').includes('#EXT-X-ENDLIST');
  } catch {
    return false;
  }
}

// Copy H.264 (no re-encode — fast, light); transcode anything else. Always downmix
// audio to stereo AAC so multichannel tracks play in every browser.
function ffmpegArgs(file: string, info: MediaInfo, enc: string, dir: string): string[] {
  const video =
    info.videoCodec === 'h264'
      ? ['-c:v', 'copy']
      : [
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
          '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
        ];
  return [
    '-nostdin', '-loglevel', 'error', '-y',
    '-i', file,
    '-map', '0:v:0', '-map', '0:a:0?',
    ...video,
    '-c:a', 'aac', '-ac', '2', '-b:a', '160k',
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments+temp_file',
    '-hls_base_url', `segment?path=${enc}&seg=`,
    '-hls_segment_filename', path.join(dir, 'seg%05d.ts'),
    path.join(dir, 'index.m3u8'),
  ];
}

function evictIfNeeded(): void {
  const live = [...sessions.values()].filter((s) => !s.done && !s.error);
  if (live.length < MAX_SESSIONS) return;
  live.sort((a, b) => a.startedAt - b.startedAt);
  const oldest = live[0];
  if (oldest) {
    oldest.proc?.kill('SIGKILL');
    sessions.delete(oldest.key);
  }
}

function startSession(file: string, info: MediaInfo, enc: string): Session {
  evictIfNeeded();
  const key = cacheKey(file);
  const dir = path.join(HLS_ROOT, key);
  ensureDir(dir);
  const playlist = path.join(dir, 'index.m3u8');
  const proc = spawn('ffmpeg', ffmpegArgs(file, info, enc, dir), { stdio: ['ignore', 'ignore', 'pipe'] });
  const session: Session = { key, dir, playlist, proc, done: false, error: false, startedAt: Date.now() };
  let stderr = '';
  proc.stderr?.on('data', (d) => (stderr += d.toString().slice(0, 1000)));
  proc.on('close', (code) => {
    session.proc = null;
    if (code === 0) {
      session.done = true;
      // Convert the growing event playlist into a finished VOD playlist.
      try {
        if (!hasEndList(playlist)) fs.appendFileSync(playlist, '\n#EXT-X-ENDLIST\n');
      } catch {
        /* ignore */
      }
    } else {
      session.error = true;
      logger.debug({ code, stderr: stderr.slice(-300) }, 'hls session ffmpeg failed');
    }
  });
  sessions.set(key, session);
  return session;
}

// Get a live/finished session for a file, starting ffmpeg if needed.
export function getOrStartSession(file: string, info: MediaInfo, enc: string): Session {
  const key = cacheKey(file);
  const existing = sessions.get(key);
  if (existing && !existing.error) return existing;

  // Reuse a fully-rendered playlist left on disk from a previous run.
  const dir = path.join(HLS_ROOT, key);
  const playlist = path.join(dir, 'index.m3u8');
  if (!existing && hasEndList(playlist)) {
    const session: Session = { key, dir, playlist, proc: null, done: true, error: false, startedAt: Date.now() };
    sessions.set(key, session);
    return session;
  }
  return startSession(file, info, enc);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wait until the playlist exists and lists at least one segment (or is finished).
export async function readPlaylistWhenReady(session: Session, timeoutMs = 25000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (session.error) return null;
    try {
      const content = fs.readFileSync(session.playlist, 'utf8');
      if (content.includes('.ts') || content.includes('#EXT-X-ENDLIST')) return content;
    } catch {
      /* not written yet */
    }
    await sleep(250);
  }
  // Return whatever exists even if still warming up.
  try {
    return fs.readFileSync(session.playlist, 'utf8');
  } catch {
    return null;
  }
}

// Resolve a segment file, waiting briefly if a (transcoding) session hasn't reached it yet.
export async function getSessionSegment(file: string, seg: string, timeoutMs = 30000): Promise<string | null> {
  const dir = path.join(HLS_ROOT, cacheKey(file));
  const segPath = path.join(dir, seg);
  const session = sessions.get(cacheKey(file));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(segPath)) {
      fs.utimesSync(segPath, new Date(), new Date());
      return segPath;
    }
    if (session?.done || session?.error || !session) break;
    await sleep(250);
  }
  return fs.existsSync(segPath) ? segPath : null;
}

export function cleanupSessions(maxAgeMs = 2 * 60 * 60 * 1000): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [key, s] of sessions) {
    if (s.startedAt < cutoff && (s.done || s.error)) {
      s.proc?.kill('SIGKILL');
      sessions.delete(key);
    }
  }
}
