import { useQuery } from '@tanstack/react-query';
import { torrentsApi } from '@/api/torrents';
import { qk } from '@/lib/queryKeys';
import { useWsState } from '@/lib/connectionStore';
import { isActive, isCompleted } from '@/lib/torrentState';
import type { Torrent, DiskUsage } from '@/types';

export function useTorrents() {
  const live = useWsState() === 'open';
  return useQuery({
    queryKey: qk.torrents.list,
    queryFn: torrentsApi.list,
    // Poll only when the live socket is down.
    refetchInterval: live ? false : 2000,
  });
}

export function useActiveTorrents() {
  const q = useTorrents();
  return { ...q, data: q.data?.filter(isActive) as Torrent[] | undefined };
}

export function useDisk() {
  const live = useWsState() === 'open';
  return useQuery<DiskUsage | null>({
    queryKey: qk.disk,
    queryFn: torrentsApi.disk,
    refetchInterval: live ? false : 15000,
  });
}

export { isCompleted };
