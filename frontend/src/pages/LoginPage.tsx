import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, Loader2, Waves } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/layout/theme';
import { useAuthState, useMe, usePasskeyLogin, useRecoveryLogin, useEnrollPasskey } from '@/hooks/useAuth';
import { apiErrorMessage } from '@/api/client';

type Mode = 'passkey' | 'recovery';

// Full reload after login → fresh app state fetches /me once with the new cookie and
// lands on the dashboard. Avoids client-side cache races between route guards.
function goHome() {
  window.location.href = '/';
}

export default function LoginPage() {
  const { data: me } = useMe();
  const { data: state, isLoading } = useAuthState();
  const passkeyLogin = usePasskeyLogin();
  const recoveryLogin = useRecoveryLogin();
  const enroll = useEnrollPasskey();

  const [mode, setMode] = useState<Mode>('passkey');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const supportsWebAuthn = browserSupportsWebAuthn();

  // Already signed in (e.g. opened /login directly) → go to the dashboard.
  if (me?.authenticated) return <Navigate to="/" replace />;

  const needsEnrollment = state && !state.hasPasskeys;

  const handlePasskey = async () => {
    setError('');
    try {
      await passkeyLogin.mutateAsync();
      goHome();
    } catch (err) {
      if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError')) return;
      setError(apiErrorMessage(err, 'Passkey sign-in failed'));
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await recoveryLogin.mutateAsync({ username, password });
      goHome();
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid username or password'));
    }
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await enroll.mutateAsync({ label: 'Primary', recoveryPassword: password });
      goHome();
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Passkey creation was cancelled.');
        return;
      }
      setError(apiErrorMessage(err, 'Could not enroll passkey'));
    }
  };

  return (
    <div className="app-bg flex min-h-screen flex-col items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-6 flex items-center gap-2 text-xl font-semibold">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Waves className="h-5 w-5" />
        </span>
        Torro
      </div>

      <Card className="w-full max-w-sm animate-fade-in">
        {isLoading ? (
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        ) : needsEnrollment ? (
          <>
            <CardHeader>
              <CardTitle>Set up Torro</CardTitle>
              <CardDescription>
                Enter your recovery password to create your first passkey.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEnroll} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rec">Recovery password</Label>
                  <Input
                    id="rec"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={enroll.isPending || !supportsWebAuthn}>
                  {enroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                  Create passkey
                </Button>
                {!supportsWebAuthn && (
                  <p className="text-center text-xs text-destructive">
                    This browser does not support passkeys.
                  </p>
                )}
              </form>
            </CardContent>
          </>
        ) : mode === 'passkey' ? (
          <>
            <CardHeader>
              <CardTitle>Welcome back</CardTitle>
              <CardDescription>Sign in with your passkey.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={handlePasskey} className="w-full" size="lg" disabled={passkeyLogin.isPending}>
                {passkeyLogin.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                Sign in with passkey
              </Button>
              {error && <p className="text-center text-sm text-destructive">{error}</p>}
              <Button variant="ghost" className="w-full" onClick={() => { setMode('recovery'); setError(''); }}>
                <KeyRound className="h-4 w-4" /> Use recovery password
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Recovery sign-in</CardTitle>
              <CardDescription>Use your username and recovery password.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRecovery} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="user">Username</Label>
                  <Input id="user" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pass">Password</Label>
                  <Input
                    id="pass"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={recoveryLogin.isPending}>
                  {recoveryLogin.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign in
                </Button>
                {state?.hasPasskeys && (
                  <Button variant="ghost" className="w-full" onClick={() => { setMode('passkey'); setError(''); }}>
                    <Fingerprint className="h-4 w-4" /> Use a passkey instead
                  </Button>
                )}
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
