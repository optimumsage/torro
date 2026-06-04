import parseTorrent from 'parse-torrent';
import { badRequest } from '../utils/errors.js';

interface ParsedTorrent {
  infoHash?: string;
  infoHashV1?: string;
}

// qBittorrent's WebAPI v2 keys torrents by the lowercase v1 infohash. Prefer v1.
function pickV1Hash(parsed: ParsedTorrent): string {
  const hash = parsed.infoHashV1 ?? parsed.infoHash;
  if (!hash) {
    throw badRequest(
      'This torrent has no BitTorrent v1 infohash (v2-only torrents are not supported)'
    );
  }
  return hash.toLowerCase();
}

// Deterministically compute the infohash from a magnet URI (no network, no polling).
export async function magnetToHash(magnetUrl: string): Promise<string> {
  let parsed: ParsedTorrent;
  try {
    parsed = (await parseTorrent(magnetUrl)) as ParsedTorrent;
  } catch {
    throw badRequest('Invalid magnet link');
  }
  return pickV1Hash(parsed);
}

// Deterministically compute the infohash from a .torrent file buffer.
export async function fileToHash(buffer: Buffer): Promise<string> {
  let parsed: ParsedTorrent;
  try {
    parsed = (await parseTorrent(buffer)) as ParsedTorrent;
  } catch {
    throw badRequest('Invalid .torrent file');
  }
  return pickV1Hash(parsed);
}
