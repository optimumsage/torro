import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { JackettClient, setJackett, type AddRef } from '../src/services/jackett.js';
import { freshDb, installFakeQbit, setupRecovery, type FakeQbit } from './helpers.js';
import type { DB } from '../src/db/index.js';

// A raw Jackett /results item with only the fields our mapper reads.
function raw(over: Record<string, unknown>) {
  return {
    Title: 'X',
    Size: 1000,
    Seeders: 1,
    Peers: 0,
    PublishDate: '2024-01-01T00:00:00Z',
    MagnetUri: null,
    InfoHash: null,
    Link: null,
    Tracker: 'T',
    Category: [2000],
    CategoryDesc: 'Movies',
    ...over,
  };
}

describe('JackettClient.search (normalization)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps fields, dedupes, sorts, and surfaces warnings', async () => {
    const Results = [
      raw({ Title: 'A magnet', MagnetUri: 'magnet:?xt=urn:btih:aaa', Seeders: 5, Peers: 3, Category: [2000] }),
      raw({ Title: 'B infohash', InfoHash: 'B'.repeat(40), Seeders: 50, Peers: 7, Category: [3000], CategoryDesc: 'Audio' }),
      raw({ Title: 'C link', Link: 'http://jackett:9117/dl/yts/?jackett_apikey=SECRET&path=abc', Seeders: 10 }),
      raw({ Title: 'D dupe-low', InfoHash: 'D'.repeat(40), Seeders: 1 }),
      raw({ Title: 'D dupe-high', InfoHash: 'd'.repeat(40), Seeders: 99 }),
      raw({ Title: 'E unaddable' }), // no magnet/infohash/link -> dropped
    ];
    const Indexers = [{ Name: 'Flaky', Status: 1, Error: 'timeout' }, { Name: 'OK', Status: 2, Error: null }];

    const http = { get: vi.fn().mockResolvedValue({ data: { Results, Indexers } }) };
    vi.spyOn(axios, 'create').mockReturnValue(http as unknown as ReturnType<typeof axios.create>);

    const client = new JackettClient('http://jackett:9117', 'KEY');
    const { results, warnings } = await client.search('q');

    // Unaddable dropped; same-infohash deduped to the higher-seeded one.
    const titles = results.map((r) => r.title);
    expect(titles).toContain('B infohash');
    expect(titles).toContain('A magnet');
    expect(titles).toContain('C link');
    expect(titles).toContain('D dupe-high');
    expect(titles).not.toContain('D dupe-low');
    expect(titles).not.toContain('E unaddable');

    // Sorted by seeders desc.
    expect(results[0].title).toBe('D dupe-high');

    // leechers come from Peers; fileType from category.
    const b = results.find((r) => r.title === 'B infohash')!;
    expect(b.leechers).toBe(7);
    expect(b.fileType).toBe('audio');
    expect(b.ref).toEqual({ kind: 'infohash', infoHash: 'B'.repeat(40), title: 'B infohash' });

    const a = results.find((r) => r.title === 'A magnet')!;
    expect(a.fileType).toBe('video');
    expect(a.ref).toEqual({ kind: 'magnet', magnet: 'magnet:?xt=urn:btih:aaa' });

    // The Jackett api key must be stripped from the link before it leaves the server.
    const c = results.find((r) => r.title === 'C link')!;
    expect(c.ref.kind).toBe('link');
    expect(JSON.stringify(c.ref)).not.toContain('SECRET');

    expect(warnings).toEqual(['Flaky: timeout']);
  });

  it('builds a magnet from an infohash ref', () => {
    const client = new JackettClient('http://jackett:9117', 'KEY');
    const ref: AddRef = { kind: 'infohash', infoHash: 'A'.repeat(40), title: 'Movie 2024' };
    expect(client.toMagnet(ref)).toMatch(/^magnet:\?xt=urn:btih:a{40}&dn=Movie%202024&tr=/);
    expect(client.toMagnet({ kind: 'link', link: 'http://x' })).toBeNull();
  });
});

describe('search routes', () => {
  let app: ReturnType<typeof createApp>;
  let db: DB;
  let qbit: FakeQbit;

  const login = async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'correct-horse' });
    return agent;
  };

  beforeEach(async () => {
    db = freshDb();
    qbit = installFakeQbit();
    setJackett({
      search: async () => ({ results: [], warnings: [] }),
      toMagnet: (ref: AddRef) =>
        ref.kind === 'magnet' ? ref.magnet
        : ref.kind === 'infohash' ? `magnet:?xt=urn:btih:${ref.infoHash}`
        : null,
      fetchTorrent: async () => ({ buffer: Buffer.from('torrent'), filename: 'a.torrent' }),
    } as unknown as JackettClient);
    app = createApp();
    await setupRecovery(db, 'correct-horse');
  });

  afterEach(() => setJackett(null));

  it('requires a session', async () => {
    expect((await request(app).get('/api/search?q=matrix')).status).toBe(401);
  });

  it('reports search disabled (no key in test env)', async () => {
    const agent = await login();
    const res = await agent.get('/api/search/status');
    expect(res.body).toEqual({ enabled: false });
  });

  it('adds a magnet result via qBittorrent', async () => {
    const agent = await login();
    const res = await agent.post('/api/search/add').send({ ref: { kind: 'magnet', magnet: 'magnet:?xt=urn:btih:abc' } });
    expect(res.status).toBe(200);
    expect(res.body.hash).toHaveLength(40);
    expect(qbit.calls).toContain('addMagnet');
  });

  it('adds a link result by fetching the .torrent', async () => {
    const agent = await login();
    const res = await agent
      .post('/api/search/add')
      .send({ ref: { kind: 'link', link: 'http://jackett:9117/dl/yts/?path=abc' } });
    expect(res.status).toBe(200);
    expect(qbit.calls).toContain('addTorrentFile');
  });

  it('rejects a link outside the Jackett origin (SSRF guard)', async () => {
    const agent = await login();
    const res = await agent
      .post('/api/search/add')
      .send({ ref: { kind: 'link', link: 'http://evil.example/x' } });
    expect(res.status).toBe(400);
  });

  it('503s when search is not configured', async () => {
    setJackett(null);
    const agent = await login();
    expect((await agent.get('/api/search?q=matrix')).status).toBe(503);
  });
});
