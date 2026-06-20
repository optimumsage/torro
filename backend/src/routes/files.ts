import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { safeJoin } from '../utils/paths.js';
import { validate } from '../middleware/validate.js';
import { badRequest } from '../utils/errors.js';
import { getQbit } from '../services/qbit.js';
import { logger } from '../logger.js';
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

// Remove now-empty parent directories left behind after deleting a file,
// walking up towards (but never removing) the downloads root.
function pruneEmptyDirs(fromFile: string, root: string): void {
  const resolvedRoot = path.resolve(root);
  let dir = path.dirname(path.resolve(fromFile));
  while (dir.startsWith(resolvedRoot + path.sep)) {
    try {
      if (fs.readdirSync(dir).length > 0) break;
      fs.rmdirSync(dir);
    } catch {
      break;
    }
    dir = path.dirname(dir);
  }
}

router.get('/', (_req, res) => {
  res.json(walk(env.DOWNLOADS_PATH));
});

router.delete(
  '/',
  validate({ body: z.object({ filePath: z.string().min(1) }) }),
  async (req, res) => {
    const { filePath } = req.valid!.body as { filePath: string };
    let full: string;
    try {
      full = safeJoin(env.DOWNLOADS_PATH, filePath);
    } catch {
      throw badRequest('Invalid path');
    }

    // If the file still belongs to a torrent, tell qBittorrent to stop wanting
    // it before we unlink. qBittorrent/libtorrent keeps a file handle open on
    // active (seeding) torrents; on Linux, unlinking a file that a process still
    // has open removes the directory entry but does NOT free the disk space
    // until that handle is closed. Setting the file's priority to 0 ("do not
    // download") makes qBittorrent release the handle and stops it from
    // re-downloading the file — so the subsequent unlink actually reclaims space.
    try {
      const loc = await getQbit().findFileLocation(filePath);
      if (loc) {
        await getQbit().setFilePriorities(loc.hash, [loc.index], 0);
      }
    } catch (err) {
      logger.warn({ err, filePath }, 'Could not deprioritise file in qBittorrent before delete');
    }

    await fs.promises.rm(full, { force: true });
    pruneEmptyDirs(full, env.DOWNLOADS_PATH);
    res.json({ ok: true });
  }
);

export default router;
