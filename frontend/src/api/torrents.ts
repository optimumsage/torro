import { api } from './client';
import type { Torrent, TorrentFile, DiskUsage } from '@/types';

export const torrentsApi = {
  list: () => api.get<Torrent[]>('/torrents').then((r) => r.data),

  disk: () => api.get<{ disk: DiskUsage | null }>('/torrents/disk').then((r) => r.data.disk),

  addMagnet: (magnetUrl: string) =>
    api.post<{ hash: string }>('/torrents/magnet', { magnetUrl }).then((r) => r.data),

  addFile: (file: File) => {
    const form = new FormData();
    form.append('torrent', file);
    return api
      .post<{ hash: string; files: TorrentFile[] }>('/torrents/file', form)
      .then((r) => r.data);
  },

  files: (hash: string, autoPause = false) =>
    api
      .get<TorrentFile[]>(`/torrents/${hash}/files`, { params: { autoPause } })
      .then((r) => r.data),

  start: (hash: string, selectedIndices: number[]) =>
    api.post(`/torrents/${hash}/start`, { selectedIndices }).then((r) => r.data),

  pause: (hash: string) => api.post(`/torrents/${hash}/pause`).then((r) => r.data),
  resume: (hash: string) => api.post(`/torrents/${hash}/resume`).then((r) => r.data),
  remove: (hash: string, deleteFiles: boolean) =>
    api.delete(`/torrents/${hash}`, { params: { deleteFiles } }).then((r) => r.data),
};
