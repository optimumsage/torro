const axios = require('axios');
const FormData = require('form-data');

const BASE = process.env.QBIT_URL;
let sessionCookie = null;

async function login() {
  const res = await axios.post(
    `${BASE}/api/v2/auth/login`,
    `username=${process.env.QBIT_USERNAME}&password=${process.env.QBIT_PASSWORD}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const cookies = res.headers['set-cookie'];
  if (!cookies?.length) throw new Error('qBittorrent login returned no cookies');
  sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
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

async function getTorrents() {
  return ensureAuth(async () => {
    const res = await axios.get(`${BASE}/api/v2/torrents/info`, { headers: headers() });
    return res.data;
  });
}

// Add magnet in active state to fetch metadata and return the new torrent hash
async function addMagnet(magnetUrl, savePath = '/downloads') {
  const before = await getTorrents();
  const beforeHashes = new Set(before.map(t => t.hash));

  await ensureAuth(() =>
    axios.post(
      `${BASE}/api/v2/torrents/add`,
      `urls=${encodeURIComponent(magnetUrl)}&savepath=${savePath}&sequentialDownload=true&paused=false&stopped=false&ratioLimit=0&seedingTimeLimit=0`,
      { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
  );

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const after = await getTorrents();
    const newOne = after.find(t => !beforeHashes.has(t.hash));
    if (newOne) return newOne.hash;
  }
  throw new Error('Torrent hash not found after adding magnet');
}

// Add .torrent file in paused state and return the new torrent hash
async function addTorrentFilePaused(fileBuffer, fileName, savePath = '/downloads') {
  const before = await getTorrents();
  const beforeHashes = new Set(before.map(t => t.hash));

  const form = new FormData();
  form.append('torrents', fileBuffer, fileName);
  form.append('savepath', savePath);
  form.append('sequentialDownload', 'true');
  form.append('paused', 'true');
  form.append('stopped', 'true');
  form.append('ratioLimit', '0');
  form.append('seedingTimeLimit', '0');

  await ensureAuth(() =>
    axios.post(`${BASE}/api/v2/torrents/add`, form, { headers: { ...headers(), ...form.getHeaders() } })
  );

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const after = await getTorrents();
    const newOne = after.find(t => !beforeHashes.has(t.hash));
    if (newOne) return newOne.hash;
  }
  throw new Error('Torrent hash not found after adding file');
}

async function getTorrentFiles(hash) {
  return ensureAuth(async () => {
    const res = await axios.get(`${BASE}/api/v2/torrents/files?hash=${hash}`, { headers: headers() });
    return res.data;
  });
}

// priority: 0 = skip, 1 = normal download
async function setFilePriorities(hash, fileIndices, priority) {
  if (fileIndices.length === 0) return;
  return ensureAuth(() =>
    axios.post(
      `${BASE}/api/v2/torrents/filePrio`,
      `hash=${hash}&id=${fileIndices.join('|')}&priority=${priority}`,
      { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
  );
}

async function deleteTorrent(hash, deleteFiles = false) {
  return ensureAuth(() =>
    axios.post(
      `${BASE}/api/v2/torrents/delete`,
      `hashes=${hash}&deleteFiles=${deleteFiles}`,
      { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
  );
}

async function pauseTorrent(hash) {
  return ensureAuth(() =>
    axios.post(`${BASE}/api/v2/torrents/stop`, `hashes=${hash}`,
      { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' } })
  );
}

async function resumeTorrent(hash) {
  return ensureAuth(() =>
    axios.post(`${BASE}/api/v2/torrents/start`, `hashes=${hash}`,
      { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' } })
  );
}

module.exports = {
  addMagnet, addTorrentFilePaused,
  getTorrents, getTorrentFiles,
  setFilePriorities,
  deleteTorrent, pauseTorrent, resumeTorrent,
};
