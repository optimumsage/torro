import { Router } from 'express';
import { z } from 'zod';
import { getJackett, type AddRef, type FileType } from '../services/jackett.js';
import { getQbit } from '../services/qbit.js';
import { validate } from '../middleware/validate.js';
import { badRequest } from '../utils/errors.js';
import { env } from '../env.js';

const router = Router();

const fileType = z.enum(['video', 'audio', 'software', 'books', 'other']);

const addRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('magnet'), magnet: z.string().startsWith('magnet:') }),
  z.object({
    kind: z.literal('infohash'),
    infoHash: z.string().regex(/^[a-f0-9]{40}$/i),
    title: z.string().min(1),
  }),
  z.object({ kind: z.literal('link'), link: z.string().url() }),
]);

// Whether search is configured — lets the UI hide itself when Jackett is absent.
router.get('/status', (_req, res) => {
  res.json({ enabled: env.jackettEnabled });
});

// Keyword search across all configured Jackett indexers.
router.get(
  '/',
  validate({ query: z.object({ q: z.string().min(2), type: fileType.optional() }) }),
  async (req, res) => {
    const { q, type } = req.valid!.query as { q: string; type?: FileType };
    res.json(await getJackett().search(q, type));
  }
);

// Add a search result to qBittorrent. Returns { hash } so the client opens the
// same file-selector flow used for pasted magnets.
router.post('/add', validate({ body: z.object({ ref: addRefSchema }) }), async (req, res) => {
  const { ref } = req.valid!.body as { ref: AddRef };
  const jackett = getJackett();

  if (ref.kind === 'link') {
    // SSRF guard: only fetch from the configured Jackett origin.
    if (!ref.link.startsWith(env.JACKETT_URL)) throw badRequest('Invalid download link');
    const { buffer, filename } = await jackett.fetchTorrent(ref.link);
    const hash = await getQbit().addTorrentFile(buffer, filename, env.DOWNLOADS_PATH);
    res.json({ hash });
    return;
  }

  const magnet = jackett.toMagnet(ref);
  if (!magnet) throw badRequest('Result has no downloadable source');
  const hash = await getQbit().addMagnet(magnet, env.DOWNLOADS_PATH);
  res.json({ hash });
});

export default router;
