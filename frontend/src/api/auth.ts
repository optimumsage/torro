import { api } from './client';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type { AuthState, MeResponse, Passkey, SessionInfo } from '@/types';

export const authApi = {
  state: () => api.get<AuthState>('/auth/state').then((r) => r.data),
  me: () => api.get<MeResponse>('/auth/me').then((r) => r.data),
  recoveryLogin: (username: string, password: string) =>
    api.post('/auth/login', { username, password }).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),

  passkeys: () => api.get<Passkey[]>('/auth/passkeys').then((r) => r.data),
  removePasskey: (id: string) => api.delete(`/auth/passkeys/${id}`).then((r) => r.data),

  sessions: () => api.get<SessionInfo[]>('/auth/sessions').then((r) => r.data),
  revokeSession: (id: string) => api.delete(`/auth/sessions/${id}`).then((r) => r.data),
  revokeOtherSessions: () => api.post('/auth/sessions/revoke-others').then((r) => r.data),
};

// Full passkey login ceremony (assertion).
export async function loginWithPasskey(): Promise<void> {
  const options = await api.post('/auth/authenticate/options').then((r) => r.data);
  const response = await startAuthentication({ optionsJSON: options });
  await api.post('/auth/authenticate/verify', { response });
}

// Enroll a new passkey. `recoveryPassword` is required only for the very first passkey.
export async function enrollPasskey(label: string, recoveryPassword?: string): Promise<void> {
  const options = await api
    .post('/auth/register/options', recoveryPassword ? { password: recoveryPassword } : {})
    .then((r) => r.data);
  const response = await startRegistration({ optionsJSON: options });
  await api.post('/auth/register/verify', { response, label });
}
