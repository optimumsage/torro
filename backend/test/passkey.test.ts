import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { freshDb, installFakeQbit, setupRecovery } from './helpers.js';

let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  const db = freshDb();
  installFakeQbit();
  app = createApp();
  await setupRecovery(db, 'correct-horse');
});

describe('passkey enrollment gating (first passkey)', () => {
  it('rejects register/options without the recovery password', async () => {
    const res = await request(app).post('/api/auth/register/options').send({});
    expect(res.status).toBe(401);
  });

  it('rejects register/options with the wrong recovery password', async () => {
    const res = await request(app).post('/api/auth/register/options').send({ password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('issues registration options with the correct recovery password', async () => {
    const res = await request(app)
      .post('/api/auth/register/options')
      .send({ password: 'correct-horse' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('challenge');
    expect(res.body.rp.id).toBe('localhost');
    // A challenge cookie is set so register/verify can find the ceremony.
    expect(res.headers['set-cookie']?.join(';')).toContain('torro_webauthn=');
  });

  it('requires a session to add a passkey once one exists (no first-run gate)', async () => {
    // Simulate that a credential already exists by inserting one directly.
    const { getDb } = await import('../src/db/index.js');
    const { webauthnCredentials } = await import('../src/db/schema.js');
    getDb()
      .insert(webauthnCredentials)
      .values({
        id: 'existing',
        publicKey: Buffer.from([1, 2, 3]),
        counter: 0,
        backedUp: false,
        label: 'Existing',
        createdAt: Date.now(),
      })
      .run();

    const res = await request(app).post('/api/auth/register/options').send({ password: 'correct-horse' });
    expect(res.status).toBe(401); // password no longer enough; needs a session
  });
});
