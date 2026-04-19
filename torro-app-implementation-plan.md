# Torro: Torrent Downloader App — Complete Implementation Plan

## Overview

Build a self-hosted, Dockerized torrent management web application that runs on an EC2 instance. Users access a secure web UI from their browser to add torrents (magnet links or .torrent files), monitor download progress, stream video files in-browser, and download completed files directly to their local machine.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Torrent engine | qBittorrent-nox (headless) | Handles all torrent protocol logic, exposes REST API on :8080 |
| Backend | Node.js 20 + Express | Auth, API proxy, file streaming, JWT sessions |
| Frontend | React 18 + Vite + TailwindCSS + shadcn/ui | Web UI |
| Video player | Video.js or native HTML5 `<video>` + HLS.js | In-browser streaming |
| Reverse proxy | Nginx Alpine | Single HTTPS entry point, routes traffic |
| Containerization | Docker + Docker Compose v2 | Orchestrates all 4 services |
| Auth | JWT (jsonwebtoken) + bcrypt | Stateless login, hashed credentials |

---

## Project Structure

```
torrent-app/
├── docker-compose.yml
├── .env                          # Secrets — never commit
├── nginx/
│   ├── nginx.conf
│   └── ssl/                      # Mount your certs here (or use certbot)
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── index.js              # Express entry point
│   │   ├── middleware/
│   │   │   └── auth.js           # JWT verification middleware
│   │   ├── routes/
│   │   │   ├── auth.js           # POST /api/auth/login, /logout
│   │   │   ├── torrents.js       # Torrent CRUD routes
│   │   │   ├── files.js          # File listing, delete
│   │   │   └── stream.js         # Video streaming + file download
│   │   └── services/
│   │       └── qbit.js           # qBittorrent API wrapper
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api/
        │   └── client.js         # Axios instance with interceptors
        ├── pages/
        │   ├── Login.jsx
        │   └── Dashboard.jsx
        └── components/
            ├── AddTorrent.jsx    # Magnet link input + .torrent file upload
            ├── TorrentList.jsx   # Active downloads with progress
            ├── FileManager.jsx   # History, download, delete
            └── VideoPlayer.jsx   # In-browser streaming player
```

---

## Docker Compose

```yaml
# docker-compose.yml
version: "3.9"

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - frontend
      - backend
    restart: unless-stopped

  frontend:
    build: ./frontend
    expose:
      - "5173"
    restart: unless-stopped

  backend:
    build: ./backend
    expose:
      - "3000"
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - APP_USERNAME=${APP_USERNAME}
      - APP_PASSWORD_HASH=${APP_PASSWORD_HASH}
      - QBIT_URL=http://qbittorrent:8080
      - QBIT_USERNAME=${QBIT_USERNAME}
      - QBIT_PASSWORD=${QBIT_PASSWORD}
      - DOWNLOADS_PATH=/downloads
    volumes:
      - downloads:/downloads
    depends_on:
      - qbittorrent
    restart: unless-stopped

  qbittorrent:
    image: linuxserver/qbittorrent:latest
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
      - WEBUI_PORT=8080
    volumes:
      - downloads:/downloads
      - qbit_config:/config
    expose:
      - "8080"
    restart: unless-stopped

volumes:
  downloads:
  qbit_config:
```

### .env file

```env
JWT_SECRET=replace_with_long_random_secret_min_64_chars
APP_USERNAME=admin
APP_PASSWORD_HASH=bcrypt_hash_of_your_password
QBIT_USERNAME=admin
QBIT_PASSWORD=replace_with_qbittorrent_webui_password
```

Generate `APP_PASSWORD_HASH` with Node.js before first run:
```js
const bcrypt = require('bcrypt');
console.log(bcrypt.hashSync('your_password', 12));
```

---

## Nginx Configuration

```nginx
# nginx/nginx.conf
events { worker_connections 1024; }

http {
  client_max_body_size 100M;   # Allow large .torrent file uploads

  upstream frontend { server frontend:5173; }
  upstream backend  { server backend:3000; }

  server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # API routes → Node.js backend
    location /api/ {
      proxy_pass http://backend;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      # Required for SSE (progress streaming)
      proxy_buffering off;
      proxy_cache off;
      proxy_read_timeout 3600s;
    }

    # Everything else → React frontend
    location / {
      proxy_pass http://frontend;
      proxy_set_header Host $host;
      # Required for Vite HMR in development
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
    }
  }
}
```

---

## Backend Implementation

### Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src ./src
EXPOSE 3000
CMD ["node", "src/index.js"]
```

### Entry point

```js
// backend/src/index.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const torrentRoutes = require('./routes/torrents');
const fileRoutes = require('./routes/files');
const streamRoutes = require('./routes/stream');
const { verifyToken } = require('./middleware/auth');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/torrents', verifyToken, torrentRoutes);
app.use('/api/files', verifyToken, fileRoutes);
app.use('/api/stream', verifyToken, streamRoutes);

app.listen(3000, () => console.log('Backend running on :3000'));
```

### Auth middleware

```js
// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { verifyToken };
```

### Auth routes

```js
// backend/src/routes/auth.js
const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const validUser = username === process.env.APP_USERNAME;
  const validPass = validUser && await bcrypt.compare(password, process.env.APP_PASSWORD_HASH);
  if (!validUser || !validPass) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res
    .cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 7 * 86400000 })
    .json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token').json({ ok: true });
});

module.exports = router;
```

### qBittorrent service wrapper

```js
// backend/src/services/qbit.js
const axios = require('axios');
const FormData = require('form-data');

const BASE = process.env.QBIT_URL;
let sessionCookie = null;

async function login() {
  const res = await axios.post(`${BASE}/api/v2/auth/login`,
    `username=${process.env.QBIT_USERNAME}&password=${process.env.QBIT_PASSWORD}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  sessionCookie = res.headers['set-cookie']?.[0];
}

function headers() {
  return { Cookie: sessionCookie };
}

async function ensureAuth(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.response?.status === 403) {
      await login();
      return await fn();
    }
    throw e;
  }
}

// Add torrent by magnet link
async function addMagnet(magnetUrl, savePath = '/downloads') {
  return ensureAuth(() =>
    axios.post(`${BASE}/api/v2/torrents/add`,
      `urls=${encodeURIComponent(magnetUrl)}&savepath=${savePath}&sequentialDownload=true`,
      { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
  );
}

// Add torrent by .torrent file buffer
async function addTorrentFile(fileBuffer, fileName, savePath = '/downloads') {
  const form = new FormData();
  form.append('torrents', fileBuffer, fileName);
  form.append('savepath', savePath);
  form.append('sequentialDownload', 'true');
  return ensureAuth(() =>
    axios.post(`${BASE}/api/v2/torrents/add`, form, { headers: { ...headers(), ...form.getHeaders() } })
  );
}

// Get all torrents
async function getTorrents() {
  return ensureAuth(async () => {
    const res = await axios.get(`${BASE}/api/v2/torrents/info`, { headers: headers() });
    return res.data;
  });
}

// Delete torrent (optionally delete files)
async function deleteTorrent(hash, deleteFiles = false) {
  return ensureAuth(() =>
    axios.post(`${BASE}/api/v2/torrents/delete`,
      `hashes=${hash}&deleteFiles=${deleteFiles}`,
      { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
  );
}

// Pause / resume
async function pauseTorrent(hash) {
  return ensureAuth(() =>
    axios.post(`${BASE}/api/v2/torrents/pause`, `hashes=${hash}`,
      { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' } })
  );
}

async function resumeTorrent(hash) {
  return ensureAuth(() =>
    axios.post(`${BASE}/api/v2/torrents/resume`, `hashes=${hash}`,
      { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' } })
  );
}

module.exports = { addMagnet, addTorrentFile, getTorrents, deleteTorrent, pauseTorrent, resumeTorrent };
```

### Torrent routes

```js
// backend/src/routes/torrents.js
const router = require('express').Router();
const multer = require('multer');
const qbit = require('../services/qbit');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// List all torrents
router.get('/', async (req, res) => {
  try {
    const torrents = await qbit.getTorrents();
    res.json(torrents);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add via magnet link
router.post('/magnet', async (req, res) => {
  const { magnetUrl } = req.body;
  if (!magnetUrl?.startsWith('magnet:')) return res.status(400).json({ error: 'Invalid magnet link' });
  try {
    await qbit.addMagnet(magnetUrl);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add via .torrent file upload
router.post('/file', upload.single('torrent'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    await qbit.addTorrentFile(req.file.buffer, req.file.originalname);
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

// Pause torrent
router.post('/:hash/pause', async (req, res) => {
  try { await qbit.pauseTorrent(req.params.hash); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Resume torrent
router.post('/:hash/resume', async (req, res) => {
  try { await qbit.resumeTorrent(req.params.hash); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// SSE — real-time torrent progress updates
router.get('/progress/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const interval = setInterval(async () => {
    try {
      const torrents = await qbit.getTorrents();
      res.write(`data: ${JSON.stringify(torrents)}\n\n`);
    } catch {
      // qBittorrent temporarily unreachable, keep connection alive
    }
  }, 2000);

  req.on('close', () => clearInterval(interval));
});

module.exports = router;
```

### File routes

```js
// backend/src/routes/files.js
const router = require('express').Router();
const fs = require('fs');
const path = require('path');

const DOWNLOADS = process.env.DOWNLOADS_PATH || '/downloads';

function safeJoin(base, target) {
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(path.resolve(base))) throw new Error('Path traversal detected');
  return resolved;
}

// List all files (recursive)
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
          isVideo: videoExts.includes(ext)
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

// Delete a file
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
```

### Stream routes

```js
// backend/src/routes/stream.js
const router = require('express').Router();
const fs = require('fs');
const path = require('path');

const DOWNLOADS = process.env.DOWNLOADS_PATH || '/downloads';

function safeJoin(base, target) {
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(path.resolve(base))) throw new Error('Path traversal');
  return resolved;
}

// Stream a file (supports Range requests for video seek)
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
    '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4'
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const isDownload = req.query.download === 'true';

  const range = req.headers.range;

  if (range) {
    // Partial content (video streaming with seek support)
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
    // Full file download
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
```

### Backend package.json

```json
{
  "name": "torrent-backend",
  "version": "1.0.0",
  "dependencies": {
    "axios": "^1.6.0",
    "bcrypt": "^5.1.0",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "form-data": "^4.0.0",
    "jsonwebtoken": "^9.0.0",
    "multer": "^1.4.5"
  }
}
```

---

## Frontend Implementation

### Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
```

### vite.config.js

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://backend:3000', changeOrigin: true }
    }
  }
});
```

### API client

```js
// frontend/src/api/client.js
import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

// Redirect to login on 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) window.location.href = '/login';
    return Promise.reject(err);
  }
);

export default api;
```

### Login page

```jsx
// frontend/src/pages/Login.jsx
import { useState } from 'react';
import api from '../api/client';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/login', { username, password });
      window.location.href = '/';
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-xl shadow-xl w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-white">Torrent Manager</h1>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <input
          type="text" placeholder="Username" value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500"
          required
        />
        <input
          type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500"
          required
        />
        <button
          type="submit" disabled={loading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
```

### AddTorrent component

```jsx
// frontend/src/components/AddTorrent.jsx
import { useState, useRef } from 'react';
import api from '../api/client';

export default function AddTorrent({ onAdded }) {
  const [magnet, setMagnet] = useState('');
  const [status, setStatus] = useState('');
  const fileRef = useRef();

  const addMagnet = async () => {
    if (!magnet.trim()) return;
    try {
      await api.post('/torrents/magnet', { magnetUrl: magnet.trim() });
      setMagnet('');
      setStatus('Added!');
      onAdded?.();
      setTimeout(() => setStatus(''), 3000);
    } catch {
      setStatus('Failed to add magnet link');
    }
  };

  const addFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('torrent', file);
    try {
      await api.post('/torrents/file', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setStatus('Torrent file added!');
      onAdded?.();
      setTimeout(() => setStatus(''), 3000);
    } catch {
      setStatus('Failed to upload torrent file');
    }
    fileRef.current.value = '';
  };

  return (
    <div className="bg-gray-900 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-white">Add torrent</h2>
      <div className="flex gap-2">
        <input
          type="text" placeholder="magnet:?xt=urn:btih:..." value={magnet}
          onChange={e => setMagnet(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addMagnet()}
          className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 text-sm"
        />
        <button onClick={addMagnet} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
          Add
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-gray-500 text-sm">or upload a .torrent file</span>
        <input ref={fileRef} type="file" accept=".torrent" onChange={addFile} className="text-sm text-gray-400" />
      </div>
      {status && <p className="text-green-400 text-sm">{status}</p>}
    </div>
  );
}
```

### TorrentList component

```jsx
// frontend/src/components/TorrentList.jsx
import { useEffect, useState } from 'react';
import api from '../api/client';

const STATE_LABELS = {
  downloading: 'Downloading', uploading: 'Seeding', pausedDL: 'Paused',
  stalledDL: 'Stalled', checkingDL: 'Checking', error: 'Error',
  queuedDL: 'Queued', metaDL: 'Fetching metadata',
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function TorrentList() {
  const [torrents, setTorrents] = useState([]);

  useEffect(() => {
    // Use SSE for live progress updates
    const es = new EventSource('/api/torrents/progress/stream', { withCredentials: true });
    es.onmessage = e => setTorrents(JSON.parse(e.data));
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  const deleteTorrent = async (hash, deleteFiles) => {
    if (!confirm(deleteFiles ? 'Delete torrent and all downloaded files?' : 'Remove torrent (keep files)?')) return;
    await api.delete(`/torrents/${hash}?deleteFiles=${deleteFiles}`);
  };

  const togglePause = async (torrent) => {
    const isPaused = torrent.state.includes('paused') || torrent.state.includes('Paused');
    if (isPaused) await api.post(`/torrents/${torrent.hash}/resume`);
    else await api.post(`/torrents/${torrent.hash}/pause`);
  };

  if (!torrents.length) return (
    <div className="bg-gray-900 rounded-xl p-6 text-gray-500 text-sm">No active torrents.</div>
  );

  return (
    <div className="bg-gray-900 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-white">Active downloads</h2>
      {torrents.map(t => (
        <div key={t.hash} className="border border-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-white text-sm font-medium truncate flex-1">{t.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${t.state === 'downloading' ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-400'}`}>
              {STATE_LABELS[t.state] || t.state}
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(t.progress * 100).toFixed(1)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>{(t.progress * 100).toFixed(1)}% — {formatBytes(t.downloaded)} / {formatBytes(t.size)}</span>
            <span>↓ {formatBytes(t.dlspeed)}/s</span>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => togglePause(t)} className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded">
              {t.state.includes('paused') ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => deleteTorrent(t.hash, false)} className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded">
              Remove
            </button>
            <button onClick={() => deleteTorrent(t.hash, true)} className="text-xs px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded">
              Delete files
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### FileManager component

```jsx
// frontend/src/components/FileManager.jsx
import { useEffect, useState } from 'react';
import api from '../api/client';
import VideoPlayer from './VideoPlayer';

function formatBytes(bytes) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function FileManager() {
  const [files, setFiles] = useState([]);
  const [playingPath, setPlayingPath] = useState(null);

  const loadFiles = async () => {
    const res = await api.get('/files');
    setFiles(res.data);
  };

  useEffect(() => { loadFiles(); }, []);

  const deleteFile = async (filePath) => {
    if (!confirm(`Delete ${filePath}?`)) return;
    await api.delete('/files', { data: { filePath } });
    loadFiles();
  };

  const downloadFile = (filePath) => {
    window.open(`/api/stream?path=${encodeURIComponent(filePath)}&download=true`, '_blank');
  };

  return (
    <div className="bg-gray-900 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-white">Downloaded files</h2>
      {playingPath && (
        <VideoPlayer
          src={`/api/stream?path=${encodeURIComponent(playingPath)}`}
          onClose={() => setPlayingPath(null)}
        />
      )}
      {files.length === 0 ? (
        <p className="text-gray-500 text-sm">No files yet.</p>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.path} className="flex items-center justify-between gap-2 border border-gray-800 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{f.name}</p>
                <p className="text-gray-500 text-xs">{formatBytes(f.size)}</p>
              </div>
              <div className="flex gap-2">
                {f.isVideo && (
                  <button onClick={() => setPlayingPath(f.path)} className="text-xs px-3 py-1 bg-purple-900 hover:bg-purple-800 text-purple-300 rounded">
                    Watch
                  </button>
                )}
                <button onClick={() => downloadFile(f.path)} className="text-xs px-3 py-1 bg-green-900 hover:bg-green-800 text-green-300 rounded">
                  Download
                </button>
                <button onClick={() => deleteFile(f.path)} className="text-xs px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### VideoPlayer component

```jsx
// frontend/src/components/VideoPlayer.jsx
import { useEffect, useRef } from 'react';

export default function VideoPlayer({ src, onClose }) {
  const videoRef = useRef();

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-white text-sm opacity-60 truncate">{decodeURIComponent(src.split('path=')[1] || '')}</span>
          <button onClick={onClose} className="text-white text-2xl leading-none px-3 py-1 hover:bg-white/10 rounded">✕</button>
        </div>
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          className="w-full rounded-lg bg-black"
          style={{ maxHeight: '75vh' }}
        >
          Your browser does not support HTML5 video.
        </video>
        <p className="text-gray-500 text-xs text-center">
          MKV files may not play in all browsers. Use VLC or download for best compatibility.
        </p>
      </div>
    </div>
  );
}
```

### Dashboard page

```jsx
// frontend/src/pages/Dashboard.jsx
import api from '../api/client';
import AddTorrent from '../components/AddTorrent';
import TorrentList from '../components/TorrentList';
import FileManager from '../components/FileManager';

export default function Dashboard() {
  const logout = async () => {
    await api.post('/auth/logout');
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Torrent Manager</h1>
        <button onClick={logout} className="text-sm text-gray-400 hover:text-white">Logout</button>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <AddTorrent />
        <TorrentList />
        <FileManager />
      </main>
    </div>
  );
}
```

### App.jsx (routing)

```jsx
// frontend/src/App.jsx
import { useEffect, useState } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import api from './api/client';

export default function App() {
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    api.get('/torrents')
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null; // loading
  return authed ? <Dashboard /> : <Login />;
}
```

### Frontend package.json

```json
{
  "name": "torrent-frontend",
  "private": true,
  "version": "1.0.0",
  "dependencies": {
    "axios": "^1.6.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "vite": "^5.4.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

---

## EC2 Deployment Steps

### 1. Launch EC2 instance

- AMI: Ubuntu 22.04 LTS
- Instance type: t3.medium (minimum for comfortable use)
- Storage: 50–500 GB depending on expected download volume
- Security group inbound rules:
  - Port 22 (SSH) — your IP only
  - Port 80 (HTTP) — anywhere (redirects to HTTPS)
  - Port 443 (HTTPS) — anywhere
- Assign an Elastic IP (so the address doesn't change on reboot)

### 2. Install Docker on EC2

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker
sudo apt install docker-compose-plugin -y
```

### 3. Deploy the app

```bash
# Clone or upload your project
git clone https://github.com/youruser/torrent-app.git
cd torrent-app

# Create .env with your secrets
cp .env.example .env
nano .env  # Fill in all values

# Set up SSL (option A: self-signed for testing)
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/CN=your-ec2-ip"

# Option B: use Certbot (requires a domain pointing to your EC2 IP)
# sudo apt install certbot python3-certbot-nginx -y
# sudo certbot --nginx -d yourdomain.com

# Start all services
docker compose up -d --build

# Check logs
docker compose logs -f
```

### 4. First-time qBittorrent setup

On first launch, qBittorrent generates a temporary random password. Get it from the logs:

```bash
docker compose logs qbittorrent | grep "temporary password"
```

Then update your `.env` with the correct `QBIT_PASSWORD` and restart:

```bash
docker compose restart backend
```

---

## Key Implementation Notes

### Sequential downloading for video streaming

When adding torrents (both magnet and file), always include `sequentialDownload=true` in the qBittorrent API call. This forces qBittorrent to download pieces in order from the beginning of the file, making it possible to start playing a video before it fully downloads. This is already included in the `qbit.js` service code above.

### Video format compatibility

- **MP4 (H.264/AAC)**: plays natively in all browsers
- **WebM (VP8/VP9)**: plays natively in Chrome/Firefox
- **MKV**: does NOT play in Safari; plays in Chrome/Firefox with some codecs
- **AVI**: limited browser support

For the best compatibility, the app shows a note to download and use VLC for MKV/AVI files. If you want universal playback, add FFmpeg transcoding to HLS as a future enhancement (see below).

### Path traversal protection

All file routes use the `safeJoin()` function that resolves the full path and checks it still starts with the downloads directory before allowing any file operations.

### Token storage

JWTs are stored in `httpOnly` cookies (not localStorage) to prevent XSS attacks from stealing tokens. The `secure: true` flag requires HTTPS, which is why Nginx SSL is not optional in production.

---

## Future Enhancements (Optional)

### HLS transcoding with FFmpeg

For universal video format support (MKV, AVI on Safari), add a transcoding service:

```yaml
# Add to docker-compose.yml
  transcoder:
    image: jrottenberg/ffmpeg:alpine
    volumes:
      - downloads:/downloads
      - hls_cache:/hls
```

The backend can trigger on-demand transcoding via:

```bash
ffmpeg -i /downloads/file.mkv -c:v libx264 -c:a aac \
  -hls_time 4 -hls_list_size 0 /hls/output.m3u8
```

Then serve the `.m3u8` playlist and use HLS.js in the frontend player.

### Multi-user support

Replace the single-user `.env` credentials with a SQLite database using `better-sqlite3`. Each user gets their own download subdirectory and JWT scope.

### Download queue management

Add Redis + Bull for a proper download queue with priority, scheduling, and retry logic.

### Auto-delete seeded torrents

Add a cron job (node-cron) in the backend that checks for torrents with ratio > 2.0 or older than N days and removes them automatically.

### Disk usage monitoring

Add a `/api/stats` endpoint that returns disk free/used on the downloads volume, and display it in the dashboard header.

---

## Security Checklist

Before exposing to the internet, verify:

- [ ] `.env` is in `.gitignore` and never committed
- [ ] qBittorrent web UI is NOT exposed on a public port (only accessible internally via Docker network)
- [ ] JWT secret is at least 64 random characters
- [ ] SSL certificate is installed and port 80 redirects to 443
- [ ] EC2 security group does not expose ports 3000 or 8080 publicly
- [ ] File download routes use `safeJoin()` path traversal protection
- [ ] `client_max_body_size` is set in Nginx to prevent payload attacks
- [ ] Cookies use `httpOnly`, `secure`, and `sameSite: strict`
