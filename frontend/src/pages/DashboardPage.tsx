import { AppShell } from '@/components/layout/AppShell';
import { AddTorrent } from '@/components/torrents/AddTorrent';
import { TorrentList } from '@/components/torrents/TorrentList';
import { FileManager } from '@/components/downloads/FileManager';
import { useProgressSocket } from '@/hooks/useProgressSocket';

export default function DashboardPage() {
  // Single live connection for the whole app.
  useProgressSocket(true);

  return (
    <AppShell>
      <AddTorrent />
      <TorrentList />
      <FileManager />
    </AppShell>
  );
}
