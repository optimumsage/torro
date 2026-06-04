import { initDb, type DB } from '../src/db/index.js';
import { setQbit, QbitClient, type QbitTorrent, type QbitFile } from '../src/services/qbit.js';
import { setRecoveryPassword } from '../src/auth/password.js';

// Fresh in-memory DB for each test, replacing the app singleton.
export function freshDb(): DB {
  return initDb(':memory:');
}

// A controllable fake qBittorrent client for route tests.
export class FakeQbit {
  torrents: QbitTorrent[] = [];
  files: Record<string, QbitFile[]> = {};
  calls: string[] = [];

  async getTorrents() {
    this.calls.push('getTorrents');
    return this.torrents;
  }
  async getTorrentFiles(hash: string) {
    this.calls.push(`getTorrentFiles:${hash}`);
    return this.files[hash] ?? [];
  }
  async addMagnet(_url: string) {
    this.calls.push('addMagnet');
    return 'a'.repeat(40);
  }
  async addTorrentFile() {
    this.calls.push('addTorrentFile');
    return 'b'.repeat(40);
  }
  async setFilePriorities() {
    this.calls.push('setFilePriorities');
  }
  async deleteTorrent() {
    this.calls.push('deleteTorrent');
  }
  async pauseTorrent() {
    this.calls.push('pauseTorrent');
  }
  async resumeTorrent() {
    this.calls.push('resumeTorrent');
  }
}

export function installFakeQbit(): FakeQbit {
  const fake = new FakeQbit();
  setQbit(fake as unknown as QbitClient);
  return fake;
}

export async function setupRecovery(db: DB, password = 'correct-horse'): Promise<void> {
  await setRecoveryPassword(db, password);
}
