import { describe, it, expect } from 'vitest';
import { magnetToHash } from '../src/services/infohash.js';

describe('magnetToHash', () => {
  it('extracts the lowercase v1 infohash from a magnet URI', async () => {
    const hash = 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a';
    const magnet = `magnet:?xt=urn:btih:${hash.toUpperCase()}&dn=example`;
    await expect(magnetToHash(magnet)).resolves.toBe(hash);
  });

  it('rejects a non-magnet string', async () => {
    await expect(magnetToHash('http://example.com')).rejects.toThrow();
  });
});
