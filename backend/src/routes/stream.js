const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { safeJoin } = require('../utils/paths');

const DOWNLOADS = process.env.DOWNLOADS_PATH || '/downloads';

router.get('/', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });

  let fullPath;
  try {
    fullPath = safeJoin(DOWNLOADS, filePath);
  } catch {
    return res.status(400).json({ error: 'Invalid path' });
  }

  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

  const stat = fs.statSync(fullPath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.m4v': 'video/mp4',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const isDownload = req.query.download === 'true';
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 10 * 1024 * 1024, fileSize - 1);
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(fullPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': isDownload ? 'application/octet-stream' : contentType,
      ...(isDownload && { 'Content-Disposition': `attachment; filename="${path.basename(filePath)}"` }),
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(fullPath).pipe(res);
  }
});

module.exports = router;
