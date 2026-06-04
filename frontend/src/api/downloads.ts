import { api } from './client';
import type { DownloadGroup } from '@/types';

export const downloadsApi = {
  list: () => api.get<DownloadGroup[]>('/downloads').then((r) => r.data),
  removeGroup: (hash: string) => api.delete(`/downloads/${hash}`).then((r) => r.data),
  removeFile: (filePath: string) =>
    api.delete('/files', { data: { filePath } }).then((r) => r.data),
};

// Build a stream/download URL for a file path under /downloads.
export function streamUrl(path: string, download = false): string {
  const params = new URLSearchParams({ path });
  if (download) params.set('download', 'true');
  return `/api/stream?${params.toString()}`;
}
