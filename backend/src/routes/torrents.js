const router = require('express').Router();
const multer = require('multer');
const fs = require('fs');
const qbit = require('../services/qbit');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// List all torrents
router.get('/', async (req, res) => {
  try {
    res.json(await qbit.getTorrents());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add magnet — adds active (to fetch metadata), returns hash for file selection
router.post('/magnet', async (req, res) => {
  const { magnetUrl } = req.body;
  if (!magnetUrl?.startsWith('magnet:')) return res.status(400).json({ error: 'Invalid magnet link' });
  try {
    const hash = await qbit.addMagnet(magnetUrl);
    res.json({ hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add .torrent file — adds paused, returns hash + immediate file list
router.post('/file', upload.single('torrent'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const hash = await qbit.addTorrentFilePaused(req.file.buffer, req.file.originalname);
    // .torrent files have embedded metadata so files are available quickly
    let files = [];
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        files = await qbit.getTorrentFiles(hash);
        if (files.length > 0) break;
      } catch {}
    }
    res.json({ hash, files: files.map((f, i) => ({ ...f, index: i })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get file list for a torrent (poll this for magnet links waiting on metadata)
router.get('/:hash/files', async (req, res) => {
  try {
    const files = await qbit.getTorrentFiles(req.params.hash);
    if (files.length > 0 && req.query.autoPause === 'true') {
      await qbit.pauseTorrent(req.params.hash);
    }
    res.json(files.map((f, i) => ({ ...f, index: i })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Set file priorities and start downloading
router.post('/:hash/start', async (req, res) => {
  const { hash } = req.params;
  const { selectedIndices } = req.body;
  if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) {
    return res.status(400).json({ error: 'No files selected' });
  }
  try {
    const files = await qbit.getTorrentFiles(hash);
    const allIndices = files.map((_, i) => i);
    const selectedSet = new Set(selectedIndices);
    const unselected = allIndices.filter(i => !selectedSet.has(i));

    if (unselected.length > 0) await qbit.setFilePriorities(hash, unselected, 0);
    await qbit.setFilePriorities(hash, selectedIndices, 1);
    await qbit.resumeTorrent(hash);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete torrent
router.delete('/:hash', async (req, res) => {
  const deleteFiles = req.query.deleteFiles === 'true';
  try {
    await qbit.deleteTorrent(req.params.hash, deleteFiles);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:hash/pause', async (req, res) => {
  try { await qbit.pauseTorrent(req.params.hash); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:hash/resume', async (req, res) => {
  try { await qbit.resumeTorrent(req.params.hash); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// SSE — real-time progress
router.get('/progress/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const interval = setInterval(async () => {
    try {
      const torrents = await qbit.getTorrents();
      let disk = null;
      try {
        const stats = await fs.promises.statfs(process.env.DOWNLOADS_PATH || '/downloads');
        disk = {
          total: Number(stats.bsize) * Number(stats.blocks),
          available: Number(stats.bsize) * Number(stats.bavail)
        };
      } catch (e) {
        console.error('Error getting disk space:', e);
      }
      res.write(`data: ${JSON.stringify({ torrents, disk })}\n\n`);
    } catch {
      // keep alive
    }
  }, 2000);

  req.on('close', () => clearInterval(interval));
});

module.exports = router;
