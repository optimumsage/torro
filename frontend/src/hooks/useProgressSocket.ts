import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ReconnectingSocket, progressSocketUrl } from '@/lib/ws';
import { setWsState } from '@/lib/connectionStore';
import { qk } from '@/lib/queryKeys';
import type { Torrent, WsMessage } from '@/types';
import { isCompleted } from '@/lib/torrentState';

// Single live connection for the app. Reconciles WS messages into the query cache
// and invalidates downloads when a torrent newly completes.
export function useProgressSocket(enabled: boolean): void {
  const qc = useQueryClient();
  const prevHashes = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const socket = new ReconnectingSocket({
      url: progressSocketUrl(),
      onStateChange: setWsState,
      onAuthError: () => {
        qc.invalidateQueries({ queryKey: qk.auth.me });
      },
      onMessage: (data) => {
        const msg = data as WsMessage;
        if (msg.type !== 'progress') return;

        // Don't clobber an in-flight optimistic mutation; its onSettled will reconcile.
        if (qc.isMutating({ mutationKey: ['torrent-action'] }) === 0) {
          qc.setQueryData<Torrent[]>(qk.torrents.list, msg.torrents);
        }
        if (msg.disk) qc.setQueryData(qk.disk, msg.disk);

        const completedNow = new Set(msg.torrents.filter(isCompleted).map((t) => t.hash));
        let changed = completedNow.size !== prevHashes.current.size;
        if (!changed) {
          for (const h of completedNow) if (!prevHashes.current.has(h)) { changed = true; break; }
        }
        if (changed) qc.invalidateQueries({ queryKey: qk.downloads.list });
        prevHashes.current = completedNow;
      },
    });

    socket.start();
    return () => socket.stop();
  }, [enabled, qc]);
}
