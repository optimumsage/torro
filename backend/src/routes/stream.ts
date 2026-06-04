import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { safeJoin } from '../utils/paths.js';
import { validate } from '../middleware/validate.js';
import { badRequest, notFound } from '../utils/errors.js';
import { env } from '../env.js';

const router = Router();

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
};

router.get(
  '/',
  validate({
    query: z.object({ path: z.string().min(1), download: z.string().optional() }),
  }),
  (req, res) => {
    const filePath = String(req.query.path);
    let fullPath: string;
    try {
      fullPath = safeJoin(env.DOWNLOADS_PATH, filePath);
    } catch {
      throw badRequest('Invalid path');
    }
    if (!fs.existsSync(fullPath)) throw notFound('File not found');

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
  }
);

export default router;
