export interface Torrent {
  hash: string;
  name: string;
  state: string;
  progress: number;
  size: number;
  downloaded: number;
  uploaded: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  num_seeds: number;
  num_leechs: number;
  ratio: number;
  added_on: number;
  completion_on: number;
  save_path: string;
}

export interface TorrentFile {
  name: string;
  size: number;
  progress: number;
  priority: number;
  index: number;
}

export interface DownloadFile {
  name: string;
  path: string;
  size: number;
  isVideo: boolean;
}

export interface DownloadGroup {
  name: string;
  hash: string;
  size: number;
  files: DownloadFile[];
}

export interface DiskUsage {
  total: number;
  available: number;
}

export type FileType = 'video' | 'audio' | 'software' | 'books' | 'other';

// Opaque reference the backend needs to add a search result to qBittorrent.
export type AddRef =
  | { kind: 'magnet'; magnet: string }
  | { kind: 'infohash'; infoHash: string; title: string }
  | { kind: 'link'; link: string };

export interface SearchResult {
  title: string;
  size: number;
  seeders: number;
  leechers: number;
  publishDate: number; // epoch ms (0 if unknown)
  tracker: string;
  fileType: FileType;
  ref: AddRef;
}

export interface SearchResponse {
  results: SearchResult[];
  warnings: string[];
}

export type SearchSortBy = 'relevance' | 'date' | 'seeders' | 'size';

export type WsMessage =
  | { type: 'progress'; torrents: Torrent[]; disk: DiskUsage | null }
  | { type: 'pong' }
  | { type: 'error'; message: string };

export interface AuthState {
  hasPasskeys: boolean;
  recoveryEnabled: boolean;
  authenticated: boolean;
}

export interface MeResponse {
  authenticated: boolean;
  username: string | null;
  needsEnrollment: boolean;
  authMethod: 'passkey' | 'recovery' | null;
}

export interface Passkey {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  backedUp: boolean;
}

export interface SessionInfo {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  userAgent: string | null;
  ip: string | null;
  authMethod: string;
  current: boolean;
}
