import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/common/confirm';
import { usePasskeys, useRemovePasskey } from '@/hooks/useSessions';
import { useEnrollPasskey } from '@/hooks/useAuth';
import { apiErrorMessage } from '@/api/client';
import { formatRelativeTime } from '@/lib/utils';

export function PasskeyList() {
  const { data, isLoading } = usePasskeys();
  const remove = useRemovePasskey();
  const enroll = useEnrollPasskey();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');

  const onAdd = async () => {
    try {
      await enroll.mutateAsync({ label: label.trim() || 'Passkey' });
      toast.success('Passkey added');
      setAdding(false);
      setLabel('');
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') return; // user cancelled
      toast.error(apiErrorMessage(err, 'Could not add passkey'));
    }
  };

  const onRemove = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Remove passkey?',
      description: `"${name}" will no longer be able to sign in.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (ok)
      remove.mutate(id, {
        onSuccess: () => toast.success('Passkey removed'),
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not remove passkey')),
      });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Passkeys</p>
          <p className="text-sm text-muted-foreground">Devices and authenticators that can sign in.</p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="space-y-2">
          {data?.map((pk) => (
            <Card key={pk.id} className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{pk.label}</p>
                <p className="text-xs text-muted-foreground">
                  Added {formatRelativeTime(pk.createdAt)} · Last used {formatRelativeTime(pk.lastUsedAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove passkey"
                onClick={() => onRemove(pk.id, pk.label)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a passkey</DialogTitle>
          </DialogHeader>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name (e.g. Bitwarden, iPhone)"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={onAdd} disabled={enroll.isPending}>
              {enroll.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create passkey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
