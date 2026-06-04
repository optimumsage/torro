import { Pause, Play, Trash2, MoreVertical, ArrowDown, ArrowUp, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTorrentActions } from '@/hooks/useTorrentActions';
import { useConfirm } from '@/components/common/confirm';
import { isPaused, stateLabel } from '@/lib/torrentState';
import { formatBytes, formatEta, formatSpeed } from '@/lib/utils';
import type { Torrent } from '@/types';

export function TorrentCard({ torrent }: { torrent: Torrent }) {
  const { pause, resume, remove } = useTorrentActions();
  const confirm = useConfirm();
  const paused = isPaused(torrent);
  const { label, tone } = stateLabel(torrent);
  const pct = Math.round((torrent.progress ?? 0) * 100);

  const onRemove = async (deleteFiles: boolean) => {
    const ok = await confirm({
      title: deleteFiles ? 'Delete torrent and files?' : 'Remove torrent?',
      description: deleteFiles
        ? `"${torrent.name}" and its downloaded data will be permanently deleted.`
        : `"${torrent.name}" will be removed from the list. Downloaded files are kept.`,
      confirmText: deleteFiles ? 'Delete' : 'Remove',
      destructive: true,
    });
    if (ok) remove.mutate({ hash: torrent.hash, deleteFiles });
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={torrent.name}>
            {torrent.name}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={tone}>{label}</Badge>
            <span className="text-xs text-muted-foreground">
              {formatBytes(torrent.downloaded)} / {formatBytes(torrent.size)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={paused ? 'Resume' : 'Pause'}
            onClick={() => (paused ? resume.mutate(torrent.hash) : pause.mutate(torrent.hash))}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRemove(false)}>
                <Trash2 /> Remove from list
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onRemove(true)}>
                <Trash2 /> Delete with files
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Progress value={pct} className="mt-3" />

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{pct}%</span>
        <span className="flex items-center gap-1">
          <ArrowDown className="h-3 w-3" /> {formatSpeed(torrent.dlspeed)}
        </span>
        <span className="flex items-center gap-1">
          <ArrowUp className="h-3 w-3" /> {formatSpeed(torrent.upspeed)}
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" /> {torrent.num_seeds}/{torrent.num_leechs}
        </span>
        {!paused && torrent.eta > 0 && <span>ETA {formatEta(torrent.eta)}</span>}
      </div>
    </Card>
  );
}
