import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { safeJoin } from '../utils/paths.js';
import { validate } from '../middleware/validate.js';
import { badRequest, notFound } from '../utils/errors.js';
import { env } from '../env.js';
import { ffmpegAvailableCheck, probeCached, classify } from '../services/ffmpeg.js';
import { getPlan, buildVodPlaylist, getSegment } from '../services/transcode.js';
import { getPoster, getStoryboardSprite, buildStoryboardVtt, spritePath } from '../services/thumbnails.js';
import {
  listExternalSubs,
  languageLabel,
  extractEmbeddedVtt,
  externalSubToVtt,
  isSubtitleFile,
} from '../services/subtitles.js';

const router = Router();

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
};

const pathQuery = z.object({ path: z.string().min(1), download: z.string().optional() });

// Resolve & validate a ?path= query against the downloads root.
function resolveFile(req: Request): string {
  const filePath = String(req.query.path);
  let full: string;
  try {
    full = safeJoin(env.DOWNLOADS_PATH, filePath);
  } catch {
    throw badRequest('Invalid path');
  }
  if (!fs.existsSync(full)) throw notFound('File not found');
  return full;
}

// --- Probe: how should the client play this file? ---------------------------
router.get('/probe', validate({ query: z.object({ path: z.string().min(1) }) }), async (req, res) => {
  const full = resolveFile(req);
  const relPath = String(req.query.path);
  const enc = encodeURIComponent(relPath);
  if (!(await ffmpegAvailableCheck())) {
    res.json({ mode: 'direct', transcoding: false, thumbnails: false, subtitles: [] });
    return;
  }
  const info = await probeCached(full);
  if (!info) {
    res.json({ mode: 'direct', transcoding: false, thumbnails: false, subtitles: [] });
    return;
  }
  const subtitles = [
    ...info.subtitles.map((s) => ({
      id: `embedded:${s.index}`,
      label: s.title || languageLabel(s.lang) || `Subtitle ${s.index + 1}`,
      lang: s.lang,
      source: 'embedded' as const,
      src: `/api/stream/subtitle.vtt?path=${enc}&track=${s.index}`,
    })),
    ...listExternalSubs(full, relPath).map((e) => ({
      id: `external:${e.file}`,
      label: e.label,
      lang: e.lang,
      source: 'external' as const,
      src: `/api/stream/subtitle.vtt?file=${encodeURIComponent(e.file)}`,
    })),
  ];
  const mode = classify(full, info);
  // Warm the segment plan (keyframe scan) in the background so it's ready by the
  // time the player requests the playlist.
  if (mode === 'hls') void getPlan(full, info).catch(() => {});
  res.json({
    mode,
    transcoding: true,
    thumbnails: info.hasVideo,
    durationSec: info.durationSec,
    width: info.width,
    height: info.height,
    subtitles,
  });
});

// --- Subtitles: embedded stream (?path&track) or sibling file (?file) → WebVTT
router.get(
  '/subtitle.vtt',
  validate({
    query: z.object({
      path: z.string().optional(),
      track: z.coerce.number().int().nonnegative().optional(),
      file: z.string().optional(),
    }),
  }),
  async (req, res) => {
    let vtt: Buffer | null = null;
    if (req.query.file != null) {
      let subFull: string;
      try {
        subFull = safeJoin(env.DOWNLOADS_PATH, String(req.query.file));
      } catch {
        throw badRequest('Invalid path');
      }
      if (!isSubtitleFile(subFull) || !fs.existsSync(subFull)) throw notFound('Subtitle not found');
      vtt = await externalSubToVtt(subFull);
    } else if (req.query.path != null && req.query.track != null) {
      const full = resolveFile(req);
      vtt = await extractEmbeddedVtt(full, Number(req.query.track));
    } else {
      throw badRequest('Missing subtitle reference');
    }
    if (!vtt) throw notFound('Subtitle unavailable');
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(vtt);
  }
);

// --- HLS playlist: static VOD (full duration known up front; seek anywhere).
// H.264 is stream-copied (fast); other codecs are transcoded. Audio downmixed to stereo.
router.get('/hls.m3u8', validate({ query: z.object({ path: z.string().min(1) }) }), async (req, res) => {
  const full = resolveFile(req);
  const info = await probeCached(full);
  if (!info) throw badRequest('Cannot read media');
  const plan = await getPlan(full, info);
  const playlist = buildVodPlaylist(encodeURIComponent(String(req.query.path)), plan);
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(playlist);
});

router.get(
  '/segment',
  validate({ query: z.object({ path: z.string().min(1), i: z.coerce.number().int().nonnegative() }) }),
  async (req, res) => {
    const full = resolveFile(req);
    const info = await probeCached(full);
    if (!info) throw badRequest('Cannot read media');
    const segPath = await getSegment(full, info, Number(req.query.i));
    if (!segPath) throw notFound('Segment not available');
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    fs.createReadStream(segPath).pipe(res);
  }
);

// --- Thumbnails -------------------------------------------------------------
router.get('/poster', validate({ query: z.object({ path: z.string().min(1) }) }), async (req, res) => {
  const full = resolveFile(req);
  const info = await probeCached(full);
  if (!info?.hasVideo) throw notFound('No poster');
  const poster = await getPoster(full, info);
  if (!poster) throw notFound('No poster');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(poster);
});

// Thumbnails are generated in the background — never block playback. Until the
// sprite is ready these 404, and the player simply shows no scrub previews yet.
router.get('/storyboard.vtt', validate({ query: z.object({ path: z.string().min(1) }) }), async (req, res) => {
  const full = resolveFile(req);
  const info = await probeCached(full);
  if (!info?.hasVideo) throw notFound('No storyboard');
  if (!fs.existsSync(spritePath(full))) {
    void getStoryboardSprite(full, info); // fire-and-forget; deduped internally
    throw notFound('Storyboard generating');
  }
  res.setHeader('Content-Type', 'text/vtt');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buildStoryboardVtt(encodeURIComponent(String(req.query.path)), info));
});

router.get('/sprite', validate({ query: z.object({ path: z.string().min(1) }) }), async (req, res) => {
  const full = resolveFile(req);
  if (!fs.existsSync(spritePath(full))) throw notFound('Sprite not ready');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(spritePath(full));
});

// --- Direct progressive streaming / download (byte-range) -------------------
router.get('/', validate({ query: pathQuery }), (req: Request, res: Response) => {
  const fullPath = resolveFile(req);
  const filePath = String(req.query.path);
  const fileSize = fs.statSync(fullPath).size;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const isDownload = req.query.download === 'true';
  const range = req.headers.range;

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr ?? '0', 10);
    const end = endStr ? parseInt(endStr, 10) : Math.min(start + 10 * 1024 * 1024, fileSize - 1);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
    });
    fs.createReadStream(fullPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': isDownload ? 'application/octet-stream' : contentType,
      'Accept-Ranges': 'bytes',
      ...(isDownload && {
        'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
      }),
    });
    fs.createReadStream(fullPath).pipe(res);
  }
});

export default router;
