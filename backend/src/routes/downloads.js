const router = require('express').Router();
const path = require('path');
const qbit = require('../services/qbit');

const COMPLETED_STATES = new Set([
  'uploading', 'stalledUP', 'forcedUP', 'queuedUP',
  'checkingUP', 'pausedUP', 'stoppedUP',
]);
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v']);

// Returns completed torrents, each with their file list
router.get('/', async (req, res) => {
  try {
    const torrents = await qbit.getTorrents();
    const completed = torrents.filter(t => COMPLETED_STATES.has(t.state) || t.progress === 1);

    const groups = await Promise.all(completed.map(async t => {
      try {
        const files = await qbit.getTorrentFiles(t.hash);
        return {
          name: t.name,
          hash: t.hash,
          size: t.size,
          files: files.map(f => ({
            name: path.basename(f.name),
            path: f.name,
            size: f.size,
            isVideo: VIDEO_EXTS.has(path.extname(f.name).toLowerCase()),
          })),
        };
      } catch {
        return { name: t.name, hash: t.hash, size: t.size, files: [] };
      }
    }));

    res.json(groups);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete torrent entry + all its files
router.delete('/:hash', async (req, res) => {
  try {
    await qbit.deleteTorrent(req.params.hash, true);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
