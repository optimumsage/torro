import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { safeJoin } from '../utils/paths.js';
import { validate } from '../middleware/validate.js';
import { badRequest } from '../utils/errors.js';
import { env } from '../env.js';

const router = Router();
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v']);

interface FileEntry {
  name: string;
  path: string;
  size: number;
  modified: Date;
  isVideo: boolean;
}

function walk(dir: string, base = ''): FileEntry[] {
  const results: FileEntry[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = path.join(base, entry.name);
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath, relPath));
    } else {
      const stat = fs.statSync(fullPath);
      results.push({
        name: entry.name,
        path: relPath,
        size: stat.size,
        modified: stat.mtime,
        isVideo: VIDEO_EXTS.has(path.extname(entry.name).toLowerCase()),
      });
    }
  }
  return results;
}

router.get('/', (_req, res) => {
  res.json(walk(env.DOWNLOADS_PATH));
});

router.delete(
  '/',
  validate({ body: z.object({ filePath: z.string().min(1) }) }),
  (req, res) => {
    const { filePath } = req.valid!.body as { filePath: string };
    let full: string;
    try {
      full = safeJoin(env.DOWNLOADS_PATH, filePath);
    } catch {
      throw badRequest('Invalid path');
    }
    fs.unlinkSync(full);
    res.json({ ok: true });
  }
);

export default router;
