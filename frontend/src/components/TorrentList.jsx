import { useEffect, useState } from 'react';
import api from '../api/client';
import { formatBytes } from '../utils/format';

const STATE_LABELS = {
  downloading: 'Downloading', pausedDL: 'Paused', stoppedDL: 'Stopped',
  stalledDL: 'Stalled', checkingDL: 'Checking', error: 'Error',
  queuedDL: 'Queued', metaDL: 'Fetching metadata',
};

const COMPLETED_STATES = new Set([
  'uploading', 'stalledUP', 'forcedUP', 'queuedUP',
  'checkingUP', 'pausedUP', 'stoppedUP', 'stopped',
]);

export default function TorrentList() {
  const [torrents, setTorrents] = useState([]);

  useEffect(() => {
    const es = new EventSource('/api/torrents/progress/stream', { withCredentials: true });
    es.onmessage = e => {
      const { torrents: all } = JSON.parse(e.data);
      if (all) {
        setTorrents(all.filter(t => !COMPLETED_STATES.has(t.state) && t.progress < 1));
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  const removeTorrent = async (hash) => {
    if (!confirm('Remove torrent from list? Downloaded files will be kept.')) return;
    await api.delete(`/torrents/${hash}?deleteFiles=false`);
  };

  const stopTorrent = async (hash, name) => {
    if (!confirm(`Stop and delete all files for "${name}"?`)) return;
    await api.delete(`/torrents/${hash}?deleteFiles=true`);
  };

  const togglePause = async (torrent) => {
    const isStopped = torrent.state.includes('paused') || torrent.state.includes('stopped');
    if (isStopped) await api.post(`/torrents/${torrent.hash}/resume`);
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
              {t.state.includes('paused') || t.state.includes('stopped') ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => removeTorrent(t.hash)} className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded">
              Remove
            </button>
            <button onClick={() => stopTorrent(t.hash, t.name)} className="text-xs px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded">
              Stop &amp; Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
