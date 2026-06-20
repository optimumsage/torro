import { api } from './client';
import type { AddRef, SearchResponse } from '@/types';

export const searchApi = {
  status: () => api.get<{ enabled: boolean }>('/search/status').then((r) => r.data),
  search: (q: string) => api.get<SearchResponse>('/search', { params: { q } }).then((r) => r.data),
  add: (ref: AddRef) => api.post<{ hash: string }>('/search/add', { ref }).then((r) => r.data),
};
