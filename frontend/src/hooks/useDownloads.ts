import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { downloadsApi } from '@/api/downloads';
import { qk } from '@/lib/queryKeys';
import { useWsState } from '@/lib/connectionStore';
import { apiErrorMessage } from '@/api/client';
import type { DownloadGroup } from '@/types';

export function useDownloads() {
  const live = useWsState() === 'open';
  return useQuery({
    queryKey: qk.downloads.list,
    queryFn: downloadsApi.list,
    // The WS invalidates this on completion; poll slowly as a fallback when offline.
    refetchInterval: live ? false : 10000,
  });
}

export function useRemoveDownloadGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hash: string) => downloadsApi.removeGroup(hash),
    onMutate: async (hash) => {
      await qc.cancelQueries({ queryKey: qk.downloads.list });
      const prev = qc.getQueryData<DownloadGroup[]>(qk.downloads.list);
      if (prev) qc.setQueryData(qk.downloads.list, prev.filter((g) => g.hash !== hash));
      return prev;
    },
    onError: (err, _h, prev) => {
      if (prev) qc.setQueryData(qk.downloads.list, prev);
      toast.error(apiErrorMessage(err, 'Failed to delete'));
    },
    onSuccess: () => toast.success('Deleted'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.downloads.list });
      qc.invalidateQueries({ queryKey: qk.torrents.list });
    },
  });
}

export function useRemoveDownloadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filePath: string) => downloadsApi.removeFile(filePath),
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete file')),
    onSuccess: () => {
      toast.success('File deleted');
      qc.invalidateQueries({ queryKey: qk.downloads.list });
    },
  });
}
