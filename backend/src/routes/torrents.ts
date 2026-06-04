import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getQbit } from '../services/qbit.js';
import { getDiskUsage } from '../services/disk.js';
import { validate } from '../middleware/validate.js';
import { badRequest } from '../utils/errors.js';
import { env } from '../env.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const hashParam = z.object({ hash: z.string().regex(/^[a-f0-9]{40}$/i, 'Invalid torrent hash') });

// List all torrents
router.get('/', async (_req, res) => {
  res.json(await getQbit().getTorrents());
});

// Disk usage (polling fallback for when the WebSocket is down)
router.get('/disk', async (_req, res) => {
  res.json({ disk: await getDiskUsage(env.DOWNLOADS_PATH) });
});

// Add magnet — adds active to fetch metadata, returns the deterministic hash
router.post(
  '/magnet',
  validate({ body: z.object({ magnetUrl: z.string().startsWith('magnet:', 'Invalid magnet link') }) }),
  async (req, res) => {
    const { magnetUrl } = req.valid!.body as { magnetUrl: string };
    const hash = await getQbit().addMagnet(magnetUrl, env.DOWNLOADS_PATH);
    res.json({ hash });
  }
);

// Add .torrent file — adds paused, returns hash + immediate file list
router.post('/file', upload.single('torrent'), async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded');
  const qbit = getQbit();
  const hash = await qbit.addTorrentFile(req.file.buffer, req.file.originalname, env.DOWNLOADS_PATH);
  // .torrent metadata is embedded, but qBittorrent may take a moment to surface the file list.
  let files = await qbit.getTorrentFiles(hash);
  for (let i = 0; i < 6 && files.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 500));
    files = await qbit.getTorrentFiles(hash);
  }
  res.json({ hash, files });
});

// Get file list for a torrent (poll this for magnet links waiting on metadata)
router.get(
  '/:hash/files',
  validate({ params: hashParam, query: z.object({ autoPause: z.string().optional() }) }),
  async (req, res) => {
    const qbit = getQbit();
    const files = await qbit.getTorrentFiles(String(req.params.hash));
    if (files.length > 0 && req.query.autoPause === 'true') {
      await qbit.pauseTorrent(String(req.params.hash));
    }
    res.json(files);
  }
);

// Set file priorities and start downloading
router.post(
  '/:hash/start',
  validate({
    params: hashParam,
    body: z.object({ selectedIndices: z.array(z.number().int().nonnegative()).min(1) }),
  }),
  async (req, res) => {
    const hash = String(req.params.hash);
    const { selectedIndices } = req.valid!.body as { selectedIndices: number[] };
    const qbit = getQbit();
    const files = await qbit.getTorrentFiles(hash);
    const selectedSet = new Set(selectedIndices);
    const unselected = files.map((_, i) => i).filter((i) => !selectedSet.has(i));

    if (unselected.length > 0) await qbit.setFilePriorities(hash, unselected, 0);
    await qbit.setFilePriorities(hash, selectedIndices, 1);
    await qbit.resumeTorrent(hash);
    res.json({ ok: true });
  }
);

// Delete torrent
router.delete(
  '/:hash',
  validate({ params: hashParam, query: z.object({ deleteFiles: z.string().optional() }) }),
  async (req, res) => {
    await getQbit().deleteTorrent(String(req.params.hash), req.query.deleteFiles === 'true');
    res.json({ ok: true });
  }
);

router.post('/:hash/pause', validate({ params: hashParam }), async (req, res) => {
  await getQbit().pauseTorrent(String(req.params.hash));
  res.json({ ok: true });
});

router.post('/:hash/resume', validate({ params: hashParam }), async (req, res) => {
  await getQbit().resumeTorrent(String(req.params.hash));
  res.json({ ok: true });
});

export default router;
