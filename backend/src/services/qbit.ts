import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';
import { magnetToHash, fileToHash } from './infohash.js';
import { AppError } from '../utils/errors.js';

export interface QbitTorrent {
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

export interface QbitFile {
  name: string;
  size: number;
  progress: number;
  priority: number;
  index?: number;
}

const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' } as const;

export class QbitClient {
  private http: AxiosInstance;
  private cookie: string | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(
    private baseUrl: string,
    private username: string,
    private password: string
  ) {
    this.http = axios.create({ baseURL: `${baseUrl}/api/v2`, timeout: 30_000 });
  }

  private async login(): Promise<void> {
    const body = new URLSearchParams({ username: this.username, password: this.password });
    const res = await this.http.post('/auth/login', body.toString(), { headers: FORM });
    const cookies = res.headers['set-cookie'];
    if (!cookies?.length) throw new AppError(502, 'qBittorrent login returned no session cookie');
    this.cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  }

  // Serialize concurrent re-auths so a burst of 403s triggers exactly one login.
  private async ensureLogin(): Promise<void> {
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    await this.loginPromise;
  }

  private headers(extra?: Record<string, string>) {
    return { ...(this.cookie ? { Cookie: this.cookie } : {}), ...extra };
  }

  // Run a request, transparently (re)authenticating on a 403 exactly once.
  private async withAuth<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.cookie) await this.ensureLogin();
    try {
      return await fn();
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 403) {
        await this.ensureLogin();
        return await fn();
      }
      throw e;
    }
  }

  async getTorrents(): Promise<QbitTorrent[]> {
    return this.withAuth(async () => {
      const res = await this.http.get<QbitTorrent[]>('/torrents/info', { headers: this.headers() });
      return res.data;
    });
  }

  async getTorrentFiles(hash: string): Promise<QbitFile[]> {
    return this.withAuth(async () => {
      const res = await this.http.get<QbitFile[]>(`/torrents/files`, {
        params: { hash },
        headers: this.headers(),
      });
      return res.data.map((f, index) => ({ ...f, index }));
    });
  }

  // Add a magnet active (to fetch metadata); returns the deterministic infohash.
  async addMagnet(magnetUrl: string, savePath = '/downloads'): Promise<string> {
    const hash = await magnetToHash(magnetUrl);
    const body = new URLSearchParams({
      urls: magnetUrl,
      savepath: savePath,
      sequentialDownload: 'true',
      paused: 'false',
      stopped: 'false',
    });
    await this.withAuth(() =>
      this.http.post('/torrents/add', body.toString(), { headers: this.headers(FORM) })
    );
    return hash;
  }

  // Add a .torrent file paused (metadata is embedded); returns the deterministic infohash.
  async addTorrentFile(buffer: Buffer, fileName: string, savePath = '/downloads'): Promise<string> {
    const hash = await fileToHash(buffer);
    const form = new FormData();
    form.append('torrents', buffer, fileName);
    form.append('savepath', savePath);
    form.append('sequentialDownload', 'true');
    form.append('paused', 'true');
    form.append('stopped', 'true');
    await this.withAuth(() =>
      this.http.post('/torrents/add', form, { headers: this.headers(form.getHeaders()) })
    );
    return hash;
  }

  // priority: 0 = skip, 1 = normal download
  async setFilePriorities(hash: string, indices: number[], priority: number): Promise<void> {
    if (indices.length === 0) return;
    const body = new URLSearchParams({
      hash,
      id: indices.join('|'),
      priority: String(priority),
    });
    await this.withAuth(() =>
      this.http.post('/torrents/filePrio', body.toString(), { headers: this.headers(FORM) })
    );
  }

  async deleteTorrent(hash: string, deleteFiles = false): Promise<void> {
    const body = new URLSearchParams({ hashes: hash, deleteFiles: String(deleteFiles) });
    await this.withAuth(() =>
      this.http.post('/torrents/delete', body.toString(), { headers: this.headers(FORM) })
    );
  }

  async pauseTorrent(hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    await this.withAuth(() =>
      this.http.post('/torrents/stop', body.toString(), { headers: this.headers(FORM) })
    );
  }

  async resumeTorrent(hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    await this.withAuth(() =>
      this.http.post('/torrents/start', body.toString(), { headers: this.headers(FORM) })
    );
  }
}

let _client: QbitClient | null = null;

export function getQbit(): QbitClient {
  if (!_client) throw new Error('Qbit client not initialised');
  return _client;
}

export function initQbit(baseUrl: string, username: string, password: string): QbitClient {
  _client = new QbitClient(baseUrl, username, password);
  return _client;
}

// Allow tests to inject a fake.
export function setQbit(client: QbitClient): void {
  _client = client;
}
