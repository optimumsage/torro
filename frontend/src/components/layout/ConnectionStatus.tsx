import { useWsState } from '@/lib/connectionStore';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ConnectionStatus() {
  const state = useWsState();
  const map = {
    open: { label: 'Live', dot: 'bg-success', desc: 'Receiving live updates' },
    connecting: { label: 'Connecting', dot: 'bg-amber-500 animate-pulse', desc: 'Connecting…' },
    reconnecting: { label: 'Reconnecting', dot: 'bg-amber-500 animate-pulse', desc: 'Reconnecting — falling back to polling' },
    closed: { label: 'Polling', dot: 'bg-muted-foreground', desc: 'Live connection closed — polling for updates' },
  }[state];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', map.dot)} />
          {map.label}
        </div>
      </TooltipTrigger>
      <TooltipContent>{map.desc}</TooltipContent>
    </Tooltip>
  );
}
