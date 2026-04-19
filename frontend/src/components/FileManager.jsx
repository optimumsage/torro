import { useEffect, useState, useRef } from 'react';
import api from '../api/client';
import VideoPlayer from './VideoPlayer';

function formatBytes(bytes) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function FileManager({ refreshKey }) {
  const [groups, setGroups] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [playingPath, setPlayingPath] = useState(null);
  const prevHashesRef = useRef(new Set());

  const loadDownloads = async () => {
    try {
      const res = await api.get('/downloads');
      setGroups(res.data);

      // Auto-expand newly completed torrents
      const incoming = new Set(res.data.map(g => g.hash));
      const newlyArrived = res.data
        .filter(g => !prevHashesRef.current.has(g.hash))
        .map(g => g.hash);
      if (newlyArrived.length > 0) {
        setExpanded(prev => {
          const next = new Set(prev);
          newlyArrived.forEach(h => next.add(h));
          return next;
        });
      }
      prevHashesRef.current = incoming;
    } catch {
      // silently retry on next interval
    }
  };

  useEffect(() => {
    loadDownloads();
  }, [refreshKey]);

  // Poll every 8 seconds to pick up newly completed downloads
  useEffect(() => {
    const interval = setInterval(loadDownloads, 8000);
    return () => clearInterval(interval);
  }, []);

  const toggleExpand = (hash) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash); else next.add(hash);
      return next;
    });
  };

  const deleteGroup = async (hash, name) => {
    if (!confirm(`Delete "${name}" and all its files?`)) return;
    await api.delete(`/downloads/${hash}`);
    loadDownloads();
  };

  const deleteFile = async (filePath) => {
    if (!confirm(`Delete this file?`)) return;
    await api.delete('/files', { data: { filePath } });
    loadDownloads();
  };

  const downloadFile = (filePath) => {
    window.open(`/api/stream?path=${encodeURIComponent(filePath)}&download=true`, '_blank');
  };

  if (groups.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 text-gray-500 text-sm">
        No completed downloads yet.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6 space-y-3">
      <h2 className="text-lg font-semibold text-white">Downloaded</h2>

      {playingPath && (
        <VideoPlayer
          src={`/api/stream?path=${encodeURIComponent(playingPath)}`}
          onClose={() => setPlayingPath(null)}
        />
      )}

      {groups.map(group => (
        <div key={group.hash} className="border border-gray-800 rounded-lg overflow-hidden">
          {/* Accordion header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/50">
            <button
              onClick={() => toggleExpand(group.hash)}
              className="flex-1 flex items-center gap-2 text-left min-w-0"
            >
              <span className={`text-gray-400 transition-transform ${expanded.has(group.hash) ? 'rotate-90' : ''}`}>
                ▶
              </span>
              <span className="text-white text-sm font-medium truncate">{group.name}</span>
              <span className="text-gray-500 text-xs shrink-0">{formatBytes(group.size)}</span>
            </button>
            <button
              onClick={() => deleteGroup(group.hash, group.name)}
              className="text-xs px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded shrink-0"
            >
              Delete All
            </button>
          </div>

          {/* Accordion body */}
          {expanded.has(group.hash) && (
            <div className="divide-y divide-gray-800">
              {group.files.length === 0 ? (
                <p className="px-4 py-3 text-gray-500 text-xs">No files found.</p>
              ) : (
                group.files.map(f => (
                  <div key={f.path} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-200 text-sm truncate">{f.name}</p>
                      <p className="text-gray-500 text-xs">{formatBytes(f.size)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {f.isVideo && (
                        <button
                          onClick={() => setPlayingPath(f.path)}
                          className="text-xs px-3 py-1 bg-purple-900 hover:bg-purple-800 text-purple-300 rounded"
                        >
                          Watch
                        </button>
                      )}
                      <button
                        onClick={() => downloadFile(f.path)}
                        className="text-xs px-3 py-1 bg-green-900 hover:bg-green-800 text-green-300 rounded"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => deleteFile(f.path)}
                        className="text-xs px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
