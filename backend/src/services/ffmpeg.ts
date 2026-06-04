import { spawn } from 'node:child_process';
import path from 'node:path';
import { logger } from '../logger.js';

export interface MediaInfo {
  durationSec: number;
  videoCodec: string | null;
  audioCodec: string | null;
  audioChannels: number | null;
  width: number | null;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

export type PlaybackMode = 'direct' | 'hls';

// Browser-playable when delivered as a progressive file.
const DIRECT_CONTAINERS = new Set(['.mp4', '.m4v', '.mov', '.webm']);
const DIRECT_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);
const DIRECT_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis']);

let ffmpegChecked = false;
let ffmpegAvailable = false;

function run(cmd: string, args: string[], timeoutMs = 15000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', () => resolve({ code: -1, stdout, stderr }));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

// Whether ffmpeg + ffprobe are usable (checked once).
export async function ffmpegAvailableCheck(): Promise<boolean> {
  if (ffmpegChecked) return ffmpegAvailable;
  const [a, b] = await Promise.all([run('ffmpeg', ['-version'], 5000), run('ffprobe', ['-version'], 5000)]);
  ffmpegAvailable = a.code === 0 && b.code === 0;
  ffmpegChecked = true;
  if (!ffmpegAvailable) logger.warn('ffmpeg/ffprobe not available — video transcoding & thumbnails disabled');
  return ffmpegAvailable;
}

// Inspect a media file with ffprobe.
export async function probe(filePath: string): Promise<MediaInfo | null> {
  if (!(await ffmpegAvailableCheck())) return null;
  const { code, stdout } = await run('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  if (code !== 0) return null;
  try {
    const data = JSON.parse(stdout);
    const video = data.streams?.find((s: any) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
    const audio = data.streams?.find((s: any) => s.codec_type === 'audio');
    return {
      durationSec: Math.max(0, parseFloat(data.format?.duration ?? '0') || 0),
      videoCodec: video?.codec_name ?? null,
      audioCodec: audio?.codec_name ?? null,
      audioChannels: audio?.channels ?? null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      hasVideo: !!video,
      hasAudio: !!audio,
    };
  } catch {
    return null;
  }
}

const probeCache = new Map<string, { info: MediaInfo; at: number }>();
const PROBE_TTL = 10 * 60 * 1000;

// Cached probe (downloads are immutable; avoids re-running ffprobe per segment).
export async function probeCached(filePath: string): Promise<MediaInfo | null> {
  const hit = probeCache.get(filePath);
  if (hit && Date.now() - hit.at < PROBE_TTL) return hit.info;
  const info = await probe(filePath);
  if (info) probeCache.set(filePath, { info, at: Date.now() });
  return info;
}

// Decide whether a file can be served directly or must go through HLS.
export function classify(filePath: string, info: MediaInfo): PlaybackMode {
  const ext = path.extname(filePath).toLowerCase();
  const videoOk = !info.hasVideo || (info.videoCodec != null && DIRECT_VIDEO.has(info.videoCodec));
  // Multichannel (5.1/7.1) audio frequently stalls browser playback — downmix it via HLS.
  const audioOk =
    !info.hasAudio ||
    (info.audioCodec != null && DIRECT_AUDIO.has(info.audioCodec) && (info.audioChannels ?? 2) <= 2);
  return DIRECT_CONTAINERS.has(ext) && videoOk && audioOk ? 'direct' : 'hls';
}

export { run as runCommand };
