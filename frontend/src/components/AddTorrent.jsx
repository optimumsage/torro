import { useState, useRef } from 'react';
import api from '../api/client';
import TorrentFileSelector from './TorrentFileSelector';

export default function AddTorrent({ onAdded }) {
  const [magnet, setMagnet] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selector, setSelector] = useState(null); // { hash, files? }
  const fileRef = useRef();

  const openSelector = (hash, files) => {
    setLoading(false);
    setSelector({ hash, files });
  };

  const handleStart = () => {
    setSelector(null);
    onAdded?.();
  };

  const handleCancel = () => {
    setSelector(null);
  };

  const addMagnet = async () => {
    const url = magnet.trim();
    if (!url) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/torrents/magnet', { magnetUrl: url });
      setMagnet('');
      openSelector(res.data.hash, null); // files not yet available, modal will poll
    } catch {
      setError('Failed to add magnet link');
      setLoading(false);
    }
  };

  const addFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setError('');
    const form = new FormData();
    form.append('torrent', file);
    try {
      const res = await api.post('/torrents/file', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      openSelector(res.data.hash, res.data.files);
    } catch {
      setError('Failed to upload torrent file');
      setLoading(false);
    }
    fileRef.current.value = '';
  };

  return (
    <>
      <div className="bg-gray-900 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Add torrent</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="magnet:?xt=urn:btih:..."
            value={magnet}
            onChange={e => setMagnet(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMagnet()}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 text-sm disabled:opacity-50"
          />
          <button
            onClick={addMagnet}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Adding…' : 'Add'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm">or upload a .torrent file</span>
          <input ref={fileRef} type="file" accept=".torrent" onChange={addFile} disabled={loading} className="text-sm text-gray-400 disabled:opacity-50" />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      {selector && (
        <TorrentFileSelector
          hash={selector.hash}
          initialFiles={selector.files}
          onStart={handleStart}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
