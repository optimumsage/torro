import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { safeJoin } from '../utils/paths.js';
import { validate } from '../middleware/validate.js';
import { badRequest, notFound } from '../utils/errors.js';
import { env } from '../env.js';
import { ffmpegAvailableCheck, probeCached, classify } from '../services/ffmpeg.js';
import { buildPlaylist, getSegment } from '../services/transcode.js';
import { getPoster, getStoryboardSprite, buildStoryboardVtt } from '../services/thumbnails.js';

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
  if (!(await ffmpegAvailableCheck())) {
    res.json({ mode: 'direct', transcoding: false, thumbnails: false });
    return;
  }
  const info = await probeCached(full);
  if (!info) {
    res.json({ mode: 'direct', transcoding: false, thumbnails: false });
    return;
  }
  res.json({
    mode: classify(full, info),
    transcoding: true,
    thumbnails: info.hasVideo,
    durationSec: info.durationSec,
    width: info.width,
    height: info.height,
  });
});

// --- HLS playlist (lazy on-demand transcode) --------------------------------
router.get('/hls.m3u8', validate({ query: z.object({ path: z.string().min(1) }) }), async (req, res) => {
  const full = resolveFile(req);
  const info = await probeCached(full);
  if (!info) throw badRequest('Cannot read media');
  const playlist = buildPlaylist(encodeURIComponent(String(req.query.path)), info);
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.send(playlist);
});

router.get(
  '/segment',
  validate({ query: z.object({ path: z.string().min(1), i: z.coerce.number().int().nonnegative() }) }),
  async (req, res) => {
    const full = resolveFile(req);
    const info = await probeCached(full);
    if (!info) throw badRequest('Cannot read media');
    const index = Number(req.query.i);
    const segPath = await getSegment(full, index, info);
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

router.get('/storyboard.vtt', validate({ query: z.object({ path: z.string().min(1) }) }), async (req, res) => {
  const full = resolveFile(req);
  const info = await probeCached(full);
  if (!info?.hasVideo) throw notFound('No storyboard');
  // Kick off sprite generation; the VTT references the sprite endpoint.
  const sprite = await getStoryboardSprite(full, info);
  if (!sprite) throw notFound('No storyboard');
  res.setHeader('Content-Type', 'text/vtt');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buildStoryboardVtt(encodeURIComponent(String(req.query.path)), info));
});

router.get('/sprite', validate({ query: z.object({ path: z.string().min(1) }) }), async (req, res) => {
  const full = resolveFile(req);
  const info = await probeCached(full);
  if (!info?.hasVideo) throw notFound('No sprite');
  const sprite = await getStoryboardSprite(full, info);
  if (!sprite) throw notFound('No sprite');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(sprite);
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
