import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, loginWithPasskey, enrollPasskey } from '@/api/auth';
import { qk } from '@/lib/queryKeys';
import type { MeResponse } from '@/types';

export function useMe() {
  return useQuery({ queryKey: qk.auth.me, queryFn: authApi.me, staleTime: 0 });
}

export function useAuthState() {
  return useQuery({ queryKey: qk.auth.state, queryFn: authApi.state, staleTime: 0 });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      qc.clear();
      window.location.href = '/login';
    },
  });
}

// After authenticating, mark `me` authenticated immediately (so route guards don't
// bounce on the stale cached value) and await a fresh refetch before the caller navigates.
async function settleAuth(qc: ReturnType<typeof useQueryClient>) {
  qc.setQueryData(qk.auth.me, (old: MeResponse | undefined) => ({
    authenticated: true,
    username: old?.username ?? null,
    needsEnrollment: false,
    authMethod: old?.authMethod ?? null,
  }));
  await qc.refetchQueries({ queryKey: qk.auth.me });
  qc.invalidateQueries({ queryKey: qk.auth.state });
}

export function useRecoveryLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authApi.recoveryLogin(username, password),
    onSuccess: () => settleAuth(qc),
  });
}

export function usePasskeyLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: loginWithPasskey,
    onSuccess: () => settleAuth(qc),
  });
}

export function useEnrollPasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, recoveryPassword }: { label: string; recoveryPassword?: string }) =>
      enrollPasskey(label, recoveryPassword),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: qk.auth.passkeys });
      await settleAuth(qc);
    },
  });
}
