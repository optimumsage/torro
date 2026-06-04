import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { getQbit } from '../services/qbit.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const COMPLETED_STATES = new Set([
  'uploading', 'stalledUP', 'forcedUP', 'queuedUP', 'checkingUP', 'pausedUP', 'stoppedUP',
]);
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v']);
const hashParam = z.object({ hash: z.string().regex(/^[a-f0-9]{40}$/i, 'Invalid torrent hash') });

// Completed torrents, each with their (selected) file list
router.get('/', async (_req, res) => {
  const qbit = getQbit();
  const torrents = await qbit.getTorrents();
  const completed = torrents.filter((t) => COMPLETED_STATES.has(t.state) || t.progress === 1);

  const groups = await Promise.all(
    completed.map(async (t) => {
      try {
        const files = await qbit.getTorrentFiles(t.hash);
        return {
          name: t.name,
          hash: t.hash,
          size: t.size,
          files: files
            .filter((f) => f.priority !== 0)
            .map((f) => ({
              name: path.basename(f.name),
              path: f.name,
              size: f.size,
              isVideo: VIDEO_EXTS.has(path.extname(f.name).toLowerCase()),
            })),
        };
      } catch {
        return { name: t.name, hash: t.hash, size: t.size, files: [] };
      }
    })
  );
  res.json(groups);
});

// Delete torrent entry + all its files
router.delete('/:hash', validate({ params: hashParam }), async (req, res) => {
  await getQbit().deleteTorrent(String(req.params.hash), true);
  res.json({ ok: true });
});

export default router;
