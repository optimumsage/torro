import { Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { TorrentCard } from './TorrentCard';
import { useActiveTorrents } from '@/hooks/useTorrents';

export function TorrentList() {
  const { data, isLoading } = useActiveTorrents();

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Active</h2>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="space-y-3 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </Card>
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No active downloads"
          description="Paste a magnet link or drop a .torrent file to get started."
        />
      ) : (
        <div className="space-y-3">
          {data.map((t) => (
            <TorrentCard key={t.hash} torrent={t} />
          ))}
        </div>
      )}
    </section>
  );
}
