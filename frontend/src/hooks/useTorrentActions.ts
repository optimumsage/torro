import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { torrentsApi } from '@/api/torrents';
import { qk } from '@/lib/queryKeys';
import { apiErrorMessage } from '@/api/client';
import type { Torrent } from '@/types';

const MUTATION_KEY = ['torrent-action'];

// Optimistically patch the cached torrent list, returning a rollback snapshot.
function useOptimisticTorrentPatch() {
  const qc = useQueryClient();
  return async (patch: (list: Torrent[]) => Torrent[]) => {
    await qc.cancelQueries({ queryKey: qk.torrents.list });
    const prev = qc.getQueryData<Torrent[]>(qk.torrents.list);
    if (prev) qc.setQueryData(qk.torrents.list, patch(prev));
    return prev;
  };
}

export function useTorrentActions() {
  const qc = useQueryClient();
  const optimistic = useOptimisticTorrentPatch();
  const settle = () => qc.invalidateQueries({ queryKey: qk.torrents.list });

  const pause = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: (hash: string) => torrentsApi.pause(hash),
    onMutate: (hash) =>
      optimistic((list) => list.map((t) => (t.hash === hash ? { ...t, state: 'pausedDL' } : t))),
    onError: (err, _h, prev) => {
      if (prev) qc.setQueryData(qk.torrents.list, prev);
      toast.error(apiErrorMessage(err, 'Failed to pause'));
    },
    onSettled: settle,
  });

  const resume = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: (hash: string) => torrentsApi.resume(hash),
    onMutate: (hash) =>
      optimistic((list) => list.map((t) => (t.hash === hash ? { ...t, state: 'downloading' } : t))),
    onError: (err, _h, prev) => {
      if (prev) qc.setQueryData(qk.torrents.list, prev);
      toast.error(apiErrorMessage(err, 'Failed to resume'));
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: ({ hash, deleteFiles }: { hash: string; deleteFiles: boolean }) =>
      torrentsApi.remove(hash, deleteFiles),
    onMutate: ({ hash }) => optimistic((list) => list.filter((t) => t.hash !== hash)),
    onError: (err, _v, prev) => {
      if (prev) qc.setQueryData(qk.torrents.list, prev);
      toast.error(apiErrorMessage(err, 'Failed to remove'));
    },
    onSuccess: () => toast.success('Torrent removed'),
    onSettled: () => {
      settle();
      qc.invalidateQueries({ queryKey: qk.downloads.list });
    },
  });

  return { pause, resume, remove };
}
