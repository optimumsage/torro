import { toast } from 'sonner';
import { Monitor, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessions, useRevokeSession, useRevokeOtherSessions } from '@/hooks/useSessions';
import { formatRelativeTime } from '@/lib/utils';

function deviceLabel(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (/iphone|ipad|ios/i.test(ua)) return 'iOS device';
  if (/android/i.test(ua)) return 'Android device';
  if (/mac/i.test(ua)) return 'Mac';
  if (/windows/i.test(ua)) return 'Windows PC';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Browser';
}

export function SessionList() {
  const { data, isLoading } = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const hasOthers = (data?.filter((s) => !s.current).length ?? 0) > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Active sessions</p>
          <p className="text-sm text-muted-foreground">Devices currently signed in.</p>
        </div>
        {hasOthers && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              revokeOthers.mutate(undefined, {
                onSuccess: () => toast.success('Other sessions signed out'),
              })
            }
          >
            <LogOut className="h-4 w-4" /> Sign out others
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="space-y-2">
          {data?.map((s) => (
            <Card key={s.id} className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {deviceLabel(s.userAgent)}
                  {s.current && <Badge variant="success">This device</Badge>}
                  <Badge variant="muted">{s.authMethod}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.ip ?? 'unknown IP'} · Active {formatRelativeTime(s.lastSeenAt)}
                </p>
              </div>
              {!s.current && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Revoke session"
                  onClick={() =>
                    revoke.mutate(s.id, { onSuccess: () => toast.success('Session revoked') })
                  }
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
