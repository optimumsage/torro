import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Play, Download, Trash2, FileVideo, File as FileIcon, MoreVertical } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/common/EmptyState';
import { VideoPlayerDialog } from './VideoPlayerDialog';
import { useConfirm } from '@/components/common/confirm';
import { useDownloads, useRemoveDownloadGroup, useRemoveDownloadFile } from '@/hooks/useDownloads';
import { streamUrl } from '@/api/downloads';
import { formatBytes } from '@/lib/utils';
import type { DownloadFile } from '@/types';

export function FileManager() {
  const { data, isLoading } = useDownloads();
  const removeGroup = useRemoveDownloadGroup();
  const removeFile = useRemoveDownloadFile();
  const confirm = useConfirm();
  const [playing, setPlaying] = useState<DownloadFile | null>(null);
  const [open, setOpen] = useState<string[]>([]);
  const seen = useRef<Set<string>>(new Set());

  // Auto-expand newly completed groups.
  useEffect(() => {
    if (!data) return;
    const fresh: string[] = [];
    for (const g of data) {
      if (!seen.current.has(g.hash)) {
        seen.current.add(g.hash);
        fresh.push(g.hash);
      }
    }
    if (fresh.length) setOpen((prev) => [...new Set([...prev, ...fresh])]);
  }, [data]);

  const onDeleteGroup = async (hash: string, name: string) => {
    const ok = await confirm({
      title: 'Delete download?',
      description: `"${name}" and all its files will be permanently deleted.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (ok) removeGroup.mutate(hash);
  };

  const onDeleteFile = async (path: string, name: string) => {
    const ok = await confirm({
      title: 'Delete file?',
      description: `"${name}" will be permanently deleted.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (ok) removeFile.mutate(path);
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Downloaded</h2>
      {isLoading ? (
        <Card className="p-4">
          <Skeleton className="h-5 w-1/2" />
        </Card>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={FolderOpen} title="Nothing downloaded yet" description="Completed downloads will appear here." />
      ) : (
        <Card className="px-4">
          <Accordion type="multiple" value={open} onValueChange={setOpen}>
            {data.map((group) => (
              <AccordionItem key={group.hash} value={group.hash}>
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{group.name}</span>
                      <Badge variant="muted">{group.files.length}</Badge>
                    </span>
                  </AccordionTrigger>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(group.size)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete download"
                    onClick={() => onDeleteGroup(group.hash, group.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <AccordionContent>
                  <ul className="space-y-1">
                    {group.files.map((file) => (
                      <li
                        key={file.path}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60"
                      >
                        {file.isVideo ? (
                          <FileVideo className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="flex-1 truncate text-sm" title={file.name}>
                          {file.name}
                        </span>
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                          {formatBytes(file.size)}
                        </span>
                        {file.isVideo && (
                          <Button variant="ghost" size="icon" aria-label="Play" onClick={() => setPlaying(file)}>
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="File actions">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <a href={streamUrl(file.path, true)} download>
                                <Download /> Download
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => onDeleteFile(file.path, file.name)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      )}
      <VideoPlayerDialog file={playing} onClose={() => setPlaying(null)} />
    </section>
  );
}
