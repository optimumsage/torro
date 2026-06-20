import axios, { type AxiosInstance } from 'axios';
import { AppError } from '../utils/errors.js';
import { logger } from '../logger.js';

export type FileType = 'video' | 'audio' | 'software' | 'books' | 'other';

// What the client needs to re-request a download. `link` carries the Jackett
// download-proxy URL with its api key stripped (re-added server-side on add) so
// the secret never reaches the browser.
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
  // Human-readable notes about indexers that errored (partial outages).
  warnings: string[];
}

// Raw shapes from GET /api/v2.0/indexers/all/results
interface RawResult {
  Title: string;
  Size: number | null;
  Seeders: number | null;
  Peers: number | null; // Jackett already subtracts seeders -> this is leechers
  PublishDate: string | null;
  MagnetUri: string | null;
  InfoHash: string | null;
  Link: string | null;
  Tracker: string | null;
  Category: number[] | null;
  CategoryDesc: string | null;
}
interface RawIndexer {
  Name: string;
  Status: number; // 0 unknown, 1 error, 2 ok
  Error: string | null;
}
interface RawSearchResponse {
  Results: RawResult[];
  Indexers: RawIndexer[];
}

// Torznab category map: top-level Movies=2xxx, TV=5xxx, Audio=3xxx,
// Console/PC=1xxx/4xxx, Books=7xxx. Custom per-indexer cats are >= 100000.
const FILE_TYPE_CATEGORIES: Record<Exclude<FileType, 'other'>, number[]> = {
  video: [2000, 5000],
  audio: [3000],
  software: [1000, 4000],
  books: [7000],
};

const PUBLIC_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
];

function coarseType(cats: number[] | null, desc: string | null): FileType {
  const c = cats?.[0];
  if (c != null && c < 100000) {
    const decade = Math.floor(c / 1000);
    if (decade === 2 || decade === 5) return 'video';
    if (decade === 3) return 'audio';
    if (decade === 1 || decade === 4) return 'software';
    if (decade === 7) return 'books';
  }
  const d = (desc ?? '').toLowerCase();
  if (/movie|tv|video|show|film|anime/.test(d)) return 'video';
  if (/audio|music|flac|mp3/.test(d)) return 'audio';
  if (/pc|software|app|game/.test(d)) return 'software';
  if (/book|ebook|comic/.test(d)) return 'books';
  return 'other';
}

function buildMagnet(infoHash: string, title: string): string {
  const trackers = PUBLIC_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('');
  return `magnet:?xt=urn:btih:${infoHash.toLowerCase()}&dn=${encodeURIComponent(title)}${trackers}`;
}

// Strip the api key from a Jackett /dl proxy URL before sending it to the client.
function stripApiKey(link: string): string {
  try {
    const url = new URL(link);
    url.searchParams.delete('jackett_apikey');
    url.searchParams.delete('apikey');
    return url.toString();
  } catch {
    return link;
  }
}

function pickRef(r: RawResult): AddRef | null {
  if (r.MagnetUri) return { kind: 'magnet', magnet: r.MagnetUri };
  if (r.InfoHash) return { kind: 'infohash', infoHash: r.InfoHash, title: r.Title };
  if (r.Link) return { kind: 'link', link: stripApiKey(r.Link) };
  return null;
}

export class JackettClient {
  private http: AxiosInstance;

  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {
    this.http = axios.create({ baseURL: `${baseUrl}/api/v2.0`, timeout: 30_000 });
  }

  async search(query: string, fileType?: FileType): Promise<SearchResponse> {
    const params: Record<string, string> = { apikey: this.apiKey, Query: query };
    if (fileType && fileType !== 'other') {
      params['Category[]'] = FILE_TYPE_CATEGORIES[fileType].join(',');
    }

    let data: RawSearchResponse;
    try {
      const res = await this.http.get<RawSearchResponse>('/indexers/all/results', { params });
      data = res.data;
    } catch (err) {
      logger.error({ err }, 'Jackett search request failed');
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        throw new AppError(502, 'Jackett rejected the API key');
      }
      throw new AppError(502, 'Search engine unavailable');
    }

    const seen = new Map<string, SearchResult>();
    for (const r of data.Results ?? []) {
      const ref = pickRef(r);
      if (!ref) continue; // nothing addable
      const result: SearchResult = {
        title: r.Title,
        size: r.Size ?? 0,
        seeders: r.Seeders ?? 0,
        leechers: r.Peers ?? 0,
        publishDate: r.PublishDate ? Date.parse(r.PublishDate) || 0 : 0,
        tracker: r.Tracker ?? 'unknown',
        fileType: coarseType(r.Category, r.CategoryDesc),
        ref,
      };
      const key = r.InfoHash ? r.InfoHash.toLowerCase() : `${r.Title}|${result.size}`;
      const existing = seen.get(key);
      if (!existing || result.seeders > existing.seeders) seen.set(key, result);
    }

    const results = [...seen.values()].sort((a, b) => b.seeders - a.seeders).slice(0, 100);

    const warnings = (data.Indexers ?? [])
      .filter((i) => i.Status === 1)
      .map((i) => `${i.Name}: ${i.Error || 'search failed'}`);

    return { results, warnings };
  }

  // Resolve an add-reference to a magnet (the caller hands it to qBittorrent).
  toMagnet(ref: AddRef): string | null {
    if (ref.kind === 'magnet') return ref.magnet;
    if (ref.kind === 'infohash') return buildMagnet(ref.infoHash, ref.title);
    return null; // 'link' must be fetched as a .torrent file instead
  }

  // Fetch a Jackett /dl proxy link as a .torrent buffer (re-adding the api key).
  async fetchTorrent(link: string): Promise<{ buffer: Buffer; filename: string }> {
    const url = new URL(link);
    url.searchParams.set('jackett_apikey', this.apiKey);
    try {
      const res = await this.http.get<ArrayBuffer>(url.toString(), {
        responseType: 'arraybuffer',
        baseURL: undefined,
      });
      return { buffer: Buffer.from(res.data), filename: `${url.searchParams.get('file') || 'download'}.torrent` };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch .torrent from Jackett');
      throw new AppError(502, 'Could not fetch torrent from search engine');
    }
  }

  get origin(): string {
    return this.baseUrl;
  }
}

let _client: JackettClient | null = null;

export function getJackett(): JackettClient {
  if (!_client) throw new AppError(503, 'Torrent search is not configured');
  return _client;
}

export function initJackett(baseUrl: string, apiKey: string): JackettClient {
  _client = new JackettClient(baseUrl, apiKey);
  return _client;
}

// Allow tests to inject a fake.
export function setJackett(client: JackettClient | null): void {
  _client = client;
}
