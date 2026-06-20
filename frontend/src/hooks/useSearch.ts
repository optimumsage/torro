import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { searchApi } from '@/api/search';
import { apiErrorMessage } from '@/api/client';
import { qk } from '@/lib/queryKeys';
import type { AddRef } from '@/types';

export function useSearchStatus() {
  return useQuery({
    queryKey: ['search', 'status'],
    queryFn: searchApi.status,
    staleTime: Infinity,
  });
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', 'results', query],
    queryFn: () => searchApi.search(query),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60_000, // results are static; don't refetch on remount
  });
}

export function useAddSearchResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: AddRef) => searchApi.add(ref),
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to add torrent')),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.torrents.list }),
  });
}
