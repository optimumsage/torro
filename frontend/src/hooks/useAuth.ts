import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, loginWithPasskey, enrollPasskey } from '@/api/auth';
import { qk } from '@/lib/queryKeys';

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

export function useRecoveryLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authApi.recoveryLogin(username, password),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function usePasskeyLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: loginWithPasskey,
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useEnrollPasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, recoveryPassword }: { label: string; recoveryPassword?: string }) =>
      enrollPasskey(label, recoveryPassword),
    onSuccess: () => qc.invalidateQueries(),
  });
}
