import { Download, Search } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AddTorrent } from '@/components/torrents/AddTorrent';
import { TorrentList } from '@/components/torrents/TorrentList';
import { FileManager } from '@/components/downloads/FileManager';
import { SearchTorrents } from '@/components/torrents/SearchTorrents';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProgressSocket } from '@/hooks/useProgressSocket';

export default function DashboardPage() {
  // Single live connection for the whole app.
  useProgressSocket(true);

  return (
    <AppShell>
      <Tabs defaultValue="torrents">
        <TabsList>
          <TabsTrigger value="torrents">
            <Download className="h-4 w-4" /> Torrents
          </TabsTrigger>
          <TabsTrigger value="search">
            <Search className="h-4 w-4" /> Search
          </TabsTrigger>
        </TabsList>

        <TabsContent value="torrents" className="space-y-4">
          <AddTorrent />
          <TorrentList />
          <FileManager />
        </TabsContent>

        <TabsContent value="search">
          <SearchTorrents />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
