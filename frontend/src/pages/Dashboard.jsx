import { useState } from 'react';
import api from '../api/client';
import AddTorrent from '../components/AddTorrent';
import TorrentList from '../components/TorrentList';
import FileManager from '../components/FileManager';

export default function Dashboard() {
  const [fileRefreshKey, setFileRefreshKey] = useState(0);

  const logout = async () => {
    await api.post('/auth/logout');
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Torro</h1>
        <button onClick={logout} className="text-sm text-gray-400 hover:text-white">Logout</button>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <AddTorrent onAdded={() => setFileRefreshKey(k => k + 1)} />
        <TorrentList />
        <FileManager refreshKey={fileRefreshKey} />
      </main>
    </div>
  );
}
