export const qk = {
  auth: {
    me: ['auth', 'me'] as const,
    state: ['auth', 'state'] as const,
    sessions: ['auth', 'sessions'] as const,
    passkeys: ['auth', 'passkeys'] as const,
  },
  torrents: {
    list: ['torrents', 'list'] as const,
    files: (hash: string) => ['torrents', 'files', hash] as const,
  },
  downloads: { list: ['downloads', 'list'] as const },
  disk: ['disk'] as const,
};
