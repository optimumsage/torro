import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { qk } from '@/lib/queryKeys';

export function usePasskeys() {
  return useQuery({ queryKey: qk.auth.passkeys, queryFn: authApi.passkeys });
}

export function useRemovePasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => authApi.removePasskey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.auth.passkeys }),
  });
}

export function useSessions() {
  return useQuery({ queryKey: qk.auth.sessions, queryFn: authApi.sessions });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.auth.sessions }),
  });
}

export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.revokeOtherSessions(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.auth.sessions }),
  });
}
