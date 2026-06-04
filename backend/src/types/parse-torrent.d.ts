declare module 'parse-torrent' {
  interface ParsedTorrent {
    infoHash?: string;
    infoHashV1?: string;
    infoHashV2?: string;
    name?: string;
    [key: string]: unknown;
  }
  // v11 is async: accepts a magnet URI string, Buffer, or torrent object.
  export default function parseTorrent(
    input: string | Buffer | Uint8Array
  ): Promise<ParsedTorrent>;
}
