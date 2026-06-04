import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { streamUrl } from '@/api/downloads';
import type { DownloadFile } from '@/types';

export function VideoPlayerDialog({ file, onClose }: { file: DownloadFile | null; onClose: () => void }) {
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        {file && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-6" title={file.name}>
                {file.name}
              </DialogTitle>
            </DialogHeader>
            <video
              src={streamUrl(file.path)}
              controls
              autoPlay
              className="max-h-[70vh] w-full rounded-lg bg-black"
            />
            {/\.(mkv|avi)$/i.test(file.name) && (
              <p className="text-xs text-muted-foreground">
                Some browsers can't play MKV/AVI. If it doesn't load, download the file instead.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
