import fs from 'node:fs';
import { logger } from '../logger.js';

export interface DiskUsage {
  total: number;
  available: number;
}

// Free/total bytes for the downloads volume. Returns null if unavailable.
export async function getDiskUsage(path: string): Promise<DiskUsage | null> {
  try {
    const stats = await fs.promises.statfs(path);
    return {
      total: Number(stats.bsize) * Number(stats.blocks),
      available: Number(stats.bsize) * Number(stats.bavail),
    };
  } catch (err) {
    logger.debug({ err }, 'Failed to read disk usage');
    return null;
  }
}
