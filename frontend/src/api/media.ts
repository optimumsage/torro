import { api } from './client';

export interface SubtitleTrack {
  id: string;
  label: string;
  lang?: string;
  source: 'embedded' | 'external';
  src: string;
}

export interface ProbeResult {
  mode: 'direct' | 'hls';
  transcoding: boolean;
  thumbnails: boolean;
  durationSec?: number;
  width?: number | null;
  height?: number | null;
  subtitles?: SubtitleTrack[];
}

const enc = (p: string) => encodeURIComponent(p);

export const mediaApi = {
  probe: (path: string) => api.get<ProbeResult>('/stream/probe', { params: { path } }).then((r) => r.data),
};

export const directUrl = (path: string) => `/api/stream?path=${enc(path)}`;
export const hlsUrl = (path: string) => `/api/stream/hls.m3u8?path=${enc(path)}`;
export const posterUrl = (path: string) => `/api/stream/poster?path=${enc(path)}`;
export const storyboardUrl = (path: string) => `/api/stream/storyboard.vtt?path=${enc(path)}`;

// MIME type for the direct (progressive) path, from the file extension.
export function directType(name: string): string {
  return /\.webm$/i.test(name) ? 'video/webm' : 'video/mp4';
}
