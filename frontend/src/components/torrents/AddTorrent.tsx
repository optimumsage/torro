import { useEffect, useRef, useState } from 'react';
import { Magnet, Upload, Loader2, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAddMagnet, useAddFile } from '@/hooks/useAddTorrent';
import { TorrentFileSelector } from './TorrentFileSelector';
import type { TorrentFile } from '@/types';

export function AddTorrent() {
  const [magnet, setMagnet] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<{ hash: string; files?: TorrentFile[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const addMagnet = useAddMagnet();
  const addFile = useAddFile();

  const submitMagnet = async (value: string) => {
    const url = value.trim();
    if (!url.startsWith('magnet:')) return;
    const { hash } = await addMagnet.mutateAsync(url);
    setMagnet('');
    setPending({ hash });
  };

  const submitFile = async (file: File) => {
    const { hash, files } = await addFile.mutateAsync(file);
    setPending({ hash, files });
  };

  // Paste a magnet anywhere (unless typing in a field) to prefill.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? '';
      const target = e.target as HTMLElement;
      if (text.startsWith('magnet:') && target.tagName !== 'INPUT') {
        setMagnet(text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const busy = addMagnet.isPending || addFile.isPending;

  return (
    <>
      <Card
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file?.name.endsWith('.torrent')) submitFile(file);
        }}
        className={cn('transition-colors', dragging && 'border-primary ring-2 ring-primary/30')}
      >
        <CardContent className="p-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              submitMagnet(magnet);
            }}
          >
            <div className="relative flex-1">
              <Magnet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={magnet}
                onChange={(e) => setMagnet(e.target.value)}
                placeholder="Paste a magnet link…"
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !magnet.trim().startsWith('magnet:')}>
                {addMagnet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add
              </Button>
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
                {addFile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span className="hidden sm:inline">.torrent</span>
              </Button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".torrent"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) submitFile(file);
                e.target.value = '';
              }}
            />
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Drop a <span className="font-medium">.torrent</span> file here, or paste a magnet link anywhere.
          </p>
        </CardContent>
      </Card>

      {pending && (
        <TorrentFileSelector
          hash={pending.hash}
          seedFiles={pending.files}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
