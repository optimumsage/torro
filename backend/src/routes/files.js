const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { safeJoin } = require('../utils/paths');

const DOWNLOADS = process.env.DOWNLOADS_PATH || '/downloads';

router.get('/', (req, res) => {
  function walk(dir, base = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const results = [];
    for (const entry of entries) {
      const relPath = path.join(base, entry.name);
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walk(fullPath, relPath));
      } else {
        const stat = fs.statSync(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];
        results.push({
          name: entry.name,
          path: relPath,
          size: stat.size,
          modified: stat.mtime,
          isVideo: videoExts.includes(ext),
        });
      }
    }
    return results;
  }

  try {
    res.json(walk(DOWNLOADS));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/', (req, res) => {
  const { filePath } = req.body;
  try {
    const full = safeJoin(DOWNLOADS, filePath);
    fs.unlinkSync(full);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
