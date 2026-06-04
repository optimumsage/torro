import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileTree } from './FileTree';
import { useTorrentFiles, useStartTorrent } from '@/hooks/useAddTorrent';
import { torrentsApi } from '@/api/torrents';
import { qk } from '@/lib/queryKeys';
import { formatBytes } from '@/lib/utils';
import type { TorrentFile } from '@/types';

interface Props {
  hash: string;
  seedFiles?: TorrentFile[];
  onClose: () => void;
}

export function TorrentFileSelector({ hash, seedFiles, onClose }: Props) {
  const qc = useQueryClient();
  const { data: files } = useTorrentFiles(hash, seedFiles);
  const start = useStartTorrent();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const initialized = useRef(false);
  const startedRef = useRef(false);

  // Once metadata arrives, select everything and expand top-level folders by default.
  useEffect(() => {
    if (initialized.current || !files || files.length === 0) return;
    initialized.current = true;
    setSelected(new Set(files.map((f) => f.index)));
    const topDirs = new Set<string>();
    for (const f of files) {
      const top = f.name.split('/')[0];
      if (f.name.includes('/') && top) topDirs.add(top);
    }
    setExpanded(topDirs);
  }, [files]);

  // Cancelling before starting removes the pending torrent (keep files=false).
  const cancelRemove = useMutation({
    mutationFn: () => torrentsApi.remove(hash, false),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.torrents.list }),
  });

  const close = () => {
    if (!startedRef.current) cancelRemove.mutate();
    onClose();
  };

  const toggleSelect = (indices: number[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of indices) on ? next.add(i) : next.delete(i);
      return next;
    });

  const toggleExpand = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const setAll = (on: boolean) =>
    setSelected(on && files ? new Set(files.map((f) => f.index)) : new Set());

  const selectedSize = files
    ? files.filter((f) => selected.has(f.index)).reduce((s, f) => s + f.size, 0)
    : 0;

  const handleStart = async () => {
    startedRef.current = true;
    try {
      await start.mutateAsync({ hash, indices: [...selected] });
      onClose();
    } catch {
      startedRef.current = false;
    }
  };

  const loading = !files || files.length === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[85vh] max-w-xl gap-0 p-0">
        <DialogHeader className="border-b p-5">
          <div className="flex items-center justify-between gap-4 pr-6">
            <div>
              <DialogTitle>Select files</DialogTitle>
              <DialogDescription>Choose which files to download.</DialogDescription>
            </div>
            {!loading && (
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="sm" onClick={() => setAll(true)}>
                  All
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAll(false)}>
                  None
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col gap-3 py-6">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Fetching metadata…
              </div>
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <FileTree
              files={files}
              selected={selected}
              expanded={expanded}
              toggleSelect={toggleSelect}
              toggleExpand={toggleExpand}
            />
          )}
        </div>

        <DialogFooter className="items-center justify-between border-t p-4 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {selected.size} file{selected.size === 1 ? '' : 's'} · {formatBytes(selectedSize)}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={selected.size === 0 || start.isPending}>
              {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
