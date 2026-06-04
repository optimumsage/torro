import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { MediaPlayer, MediaProvider, Poster, Track, isHLSProvider, type MediaProviderAdapter } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import Hls from 'hls.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { mediaApi, directUrl, hlsUrl, posterUrl, storyboardUrl, directType } from '@/api/media';
import type { DownloadFile } from '@/types';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

// Use the bundled hls.js instead of Vidstack's default CDN load (works offline + under CSP).
function onProviderChange(provider: MediaProviderAdapter | null) {
  if (isHLSProvider(provider)) provider.library = Hls;
}

function PlayerBody({ file }: { file: DownloadFile }) {
  const { data: probe, isLoading } = useQuery({
    queryKey: ['probe', file.path],
    queryFn: () => mediaApi.probe(file.path),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  if (isLoading) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mode = probe?.mode ?? 'direct';
  const src =
    mode === 'hls'
      ? { src: hlsUrl(file.path), type: 'application/x-mpegurl' as const }
      : { src: directUrl(file.path), type: directType(file.name) as 'video/mp4' };
  const hasThumbs = probe?.thumbnails ?? false;
  const subtitles = probe?.subtitles ?? [];

  return (
    <MediaPlayer
      className="overflow-hidden rounded-lg"
      title={file.name}
      src={src}
      aspectRatio="16/9"
      playsInline
      autoPlay
      onProviderChange={onProviderChange}
      streamType="on-demand"
    >
      <MediaProvider>
        {hasThumbs && <Poster className="vds-poster" src={posterUrl(file.path)} alt={file.name} />}
        {subtitles.map((s) => (
          <Track key={s.id} src={s.src} kind="subtitles" label={s.label} language={s.lang} type="vtt" />
        ))}
      </MediaProvider>
      <DefaultVideoLayout
        icons={defaultLayoutIcons}
        thumbnails={hasThumbs ? storyboardUrl(file.path) : undefined}
      />
    </MediaPlayer>
  );
}

export function VideoPlayerDialog({ file, onClose }: { file: DownloadFile | null; onClose: () => void }) {
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl gap-3 p-4">
        {file && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-6" title={file.name}>
                {file.name}
              </DialogTitle>
            </DialogHeader>
            <PlayerBody file={file} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
