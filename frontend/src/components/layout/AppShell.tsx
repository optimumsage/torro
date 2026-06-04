import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Settings, HardDrive, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from './theme';
import { ConnectionStatus } from './ConnectionStatus';
import { useDisk } from '@/hooks/useTorrents';
import { useLogout, useMe } from '@/hooks/useAuth';
import { formatBytes } from '@/lib/utils';

const version = (import.meta.env.VITE_APP_VERSION as string) ?? 'dev';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: disk } = useDisk();
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const used = disk ? disk.total - disk.available : 0;
  const usedPct = disk && disk.total ? Math.round((used / disk.total) * 100) : 0;

  return (
    <div className="app-bg flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-14 items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Waves className="h-4 w-4" />
            </span>
            Torro
          </Link>
          <div className="flex items-center gap-2">
            <ConnectionStatus />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{me?.username ?? 'Account'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => logout.mutate()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container w-full max-w-3xl flex-1 space-y-6 py-8">{children}</main>

      <footer className="border-t">
        <div className="container flex h-12 items-center justify-between text-xs text-muted-foreground">
          <span>Torro v{version}</span>
          {disk && (
            <span className="flex items-center gap-2">
              <HardDrive className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {formatBytes(disk.available)} free of {formatBytes(disk.total)}
              </span>
              <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${usedPct}%` }} />
              </span>
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
