import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

function formatBytes(bytes) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// Build a tree from flat qBit file list
function buildTree(files) {
  const root = { children: {}, files: [] };
  for (const f of files) {
    const parts = f.name.split('/');
    if (parts.length === 1) {
      root.files.push(f);
    } else {
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (!node.children[seg]) node.children[seg] = { children: {}, files: [] };
        node = node.children[seg];
      }
      node.files.push({ ...f, displayName: parts[parts.length - 1] });
    }
  }
  return root;
}

function getNodeIndices(node) {
  const indices = [];
  for (const f of node.files) indices.push(f.index);
  for (const child of Object.values(node.children)) indices.push(...getNodeIndices(child));
  return indices;
}

function FolderNode({ name, node, selected, onToggleIndex, depth = 0 }) {
  const [open, setOpen] = useState(true);
  const indices = getNodeIndices(node);
  const selectedCount = indices.filter(i => selected.has(i)).length;
  const allSelected = selectedCount === indices.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const handleFolderCheck = () => {
    if (allSelected) indices.forEach(i => onToggleIndex(i, false));
    else indices.forEach(i => onToggleIndex(i, true));
  };

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-2 py-1.5 hover:bg-gray-800/50 rounded px-2">
        <input
          type="checkbox"
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected; }}
          onChange={handleFolderCheck}
          className="accent-blue-500 w-4 h-4 shrink-0"
        />
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 flex-1 text-left min-w-0">
          <span className="text-gray-400 text-xs">{open ? '▼' : '▶'}</span>
          <span className="text-gray-300 text-sm font-medium truncate">{name}/</span>
        </button>
      </div>
      {open && (
        <>
          {Object.entries(node.children).map(([childName, childNode]) => (
            <FolderNode key={childName} name={childName} node={childNode} selected={selected} onToggleIndex={onToggleIndex} depth={depth + 1} />
          ))}
          {node.files.map(f => (
            <FileRow key={f.index} file={f} selected={selected.has(f.index)} onToggle={() => onToggleIndex(f.index, !selected.has(f.index))} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  );
}

function FileRow({ file, selected, onToggle, depth = 0 }) {
  return (
    <div style={{ marginLeft: depth * 16 }} className="flex items-center gap-2 py-1.5 hover:bg-gray-800/50 rounded px-2">
      <input type="checkbox" checked={selected} onChange={onToggle} className="accent-blue-500 w-4 h-4 shrink-0" />
      <span className="text-gray-200 text-sm truncate flex-1">{file.displayName ?? file.name}</span>
      <span className="text-gray-500 text-xs shrink-0">{formatBytes(file.size)}</span>
    </div>
  );
}

export default function TorrentFileSelector({ hash, initialFiles, onStart, onCancel }) {
  const [files, setFiles] = useState(initialFiles ?? []);
  const [selected, setSelected] = useState(new Set());
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(!initialFiles?.length);

  // Poll for files if not yet available (magnet links need metadata)
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/torrents/${hash}/files`);
        if (res.data.length > 0) {
          setFiles(res.data);
          setPolling(false);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [hash, polling]);

  // Select all once files load
  useEffect(() => {
    if (files.length > 0) {
      setSelected(new Set(files.map(f => f.index)));
    }
  }, [files]);

  const toggleIndex = useCallback((index, value) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (value) next.add(index); else next.delete(index);
      return next;
    });
  }, []);

  const selectedSize = files.filter(f => selected.has(f.index)).reduce((s, f) => s + f.size, 0);

  const handleStart = async () => {
    if (selected.size === 0) return;
    setStarting(true);
    try {
      await api.post(`/torrents/${hash}/start`, { selectedIndices: [...selected] });
    } catch {}
    onStart();
  };

  const handleCancel = async () => {
    try { await api.delete(`/torrents/${hash}?deleteFiles=true`); } catch {}
    onCancel();
  };

  const tree = buildTree(files);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <h2 className="text-white font-semibold text-base">Select files to download</h2>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set(files.map(f => f.index)))} className="text-xs text-blue-400 hover:text-blue-300">All</button>
            <span className="text-gray-600">·</span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-300">None</button>
          </div>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {polling ? (
            <div className="text-gray-500 text-sm text-center py-8">Fetching metadata…</div>
          ) : files.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-8">No files found.</div>
          ) : (
            <>
              {Object.entries(tree.children).map(([name, node]) => (
                <FolderNode key={name} name={name} node={node} selected={selected} onToggleIndex={toggleIndex} />
              ))}
              {tree.files.map(f => (
                <FileRow key={f.index} file={f} selected={selected.has(f.index)} onToggle={() => toggleIndex(f.index, !selected.has(f.index))} />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between gap-4 shrink-0">
          <span className="text-gray-400 text-xs">
            {selected.size} file{selected.size !== 1 ? 's' : ''} · {formatBytes(selectedSize)}
          </span>
          <div className="flex gap-2">
            <button onClick={handleCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg bg-gray-800 hover:bg-gray-700">
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={selected.size === 0 || starting}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {starting ? 'Starting…' : 'Download'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
