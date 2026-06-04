import { useState } from 'react';
import { FileVideo, File as FileIcon, Play } from 'lucide-react';
import { posterUrl } from '@/api/media';
import { cn } from '@/lib/utils';

// Poster thumbnail for a downloaded file. Falls back to an icon for non-videos
// or when no poster is available (e.g. ffmpeg disabled). Clicking a video plays it.
export function VideoThumb({
  path,
  isVideo,
  onPlay,
}: {
  path: string;
  isVideo: boolean;
  onPlay?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (!isVideo) {
    return (
      <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded bg-muted">
        <FileIcon className="h-4 w-4 text-muted-foreground" />
      </span>
    );
  }

  if (failed) {
    return (
      <button
        type="button"
        onClick={onPlay}
        className="group flex h-9 w-16 shrink-0 items-center justify-center rounded bg-muted"
        aria-label="Play"
      >
        <FileVideo className="h-4 w-4 text-primary group-hover:hidden" />
        <Play className="hidden h-4 w-4 text-primary group-hover:block" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onPlay}
      className="group relative h-9 w-16 shrink-0 overflow-hidden rounded bg-black"
      aria-label="Play"
    >
      <img
        src={posterUrl(path)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('h-full w-full object-cover transition-opacity group-hover:opacity-70')}
      />
      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
        <Play className="h-4 w-4 text-white drop-shadow" />
      </span>
    </button>
  );
}
