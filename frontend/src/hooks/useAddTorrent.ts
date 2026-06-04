import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { torrentsApi } from '@/api/torrents';
import { qk } from '@/lib/queryKeys';
import { apiErrorMessage } from '@/api/client';
import type { TorrentFile } from '@/types';

export function useAddMagnet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (magnetUrl: string) => torrentsApi.addMagnet(magnetUrl),
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to add magnet')),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.torrents.list }),
  });
}

export function useAddFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => torrentsApi.addFile(file),
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to add .torrent')),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.torrents.list }),
  });
}

// Poll the file list for a torrent until metadata arrives (magnet links).
export function useTorrentFiles(hash: string | null, seed?: TorrentFile[]) {
  return useQuery({
    queryKey: hash ? qk.torrents.files(hash) : ['torrents', 'files', 'none'],
    queryFn: () => torrentsApi.files(hash!),
    enabled: !!hash,
    initialData: seed,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) === 0 ? 1000 : false),
  });
}

export function useStartTorrent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ hash, indices }: { hash: string; indices: number[] }) =>
      torrentsApi.start(hash, indices),
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to start download')),
    onSuccess: () => {
      toast.success('Download started');
      qc.invalidateQueries({ queryKey: qk.torrents.list });
    },
  });
}
