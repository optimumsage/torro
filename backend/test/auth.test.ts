import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { freshDb, installFakeQbit, setupRecovery, type FakeQbit } from './helpers.js';
import type { DB } from '../src/db/index.js';

let app: ReturnType<typeof createApp>;
let db: DB;
let qbit: FakeQbit;

beforeEach(async () => {
  db = freshDb();
  qbit = installFakeQbit();
  app = createApp();
  await setupRecovery(db, 'correct-horse');
});

describe('auth state', () => {
  it('reports no passkeys and not authenticated initially', async () => {
    const res = await request(app).get('/api/auth/state');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hasPasskeys: false, authenticated: false, recoveryEnabled: true });
  });

  it('me reports needsEnrollment when there are no passkeys', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.body).toMatchObject({ authenticated: false, needsEnrollment: true });
  });
});

describe('recovery login', () => {
  it('rejects wrong credentials with a generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('accepts correct credentials and establishes a session', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ username: 'admin', password: 'correct-horse' });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie']?.[0]).toContain('torro_session=');

    const me = await agent.get('/api/auth/me');
    expect(me.body.authenticated).toBe(true);
  });

  it('locks out after repeated failures', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ username: 'admin', password: 'nope' });
    }
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'correct-horse' });
    expect(res.status).toBe(429);
  });
});

describe('session protection', () => {
  it('blocks torrent routes without a session', async () => {
    const res = await request(app).get('/api/torrents');
    expect(res.status).toBe(401);
  });

  it('allows torrent routes with a session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'correct-horse' });
    const res = await agent.get('/api/torrents');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('logout revokes the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'correct-horse' });
    await agent.post('/api/auth/logout');
    const res = await agent.get('/api/torrents');
    expect(res.status).toBe(401);
  });
});

describe('error handler', () => {
  it('does not leak internal error messages', async () => {
    qbit.getTorrents = async () => {
      throw new Error('SECRET internal detail at /downloads');
    };
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'correct-horse' });
    const res = await agent.get('/api/torrents');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal error');
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });
});

describe('validation', () => {
  it('rejects an invalid magnet link', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'correct-horse' });
    const res = await agent.post('/api/torrents/magnet').send({ magnetUrl: 'http://not-a-magnet' });
    expect(res.status).toBe(400);
  });
});
