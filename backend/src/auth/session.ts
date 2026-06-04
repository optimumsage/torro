import crypto from 'node:crypto';
import { eq, lt, ne } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { sessions, type Session } from '../db/schema.js';
import { env } from '../env.js';

export const SESSION_COOKIE = 'torro_session';
const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface CreateSessionOpts {
  authMethod: 'passkey' | 'recovery';
  credentialId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}

// Create a session, returning the opaque token to set in the cookie (only the hash is stored).
export function createSession(db: DB, now: number, opts: CreateSessionOpts): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const id = hashToken(token);
  db.insert(sessions)
    .values({
      id,
      createdAt: now,
      expiresAt: now + env.SESSION_TTL_DAYS * DAY_MS,
      absoluteExpiresAt: now + env.SESSION_ABSOLUTE_TTL_DAYS * DAY_MS,
      lastSeenAt: now,
      userAgent: opts.userAgent ?? null,
      ip: opts.ip ?? null,
      authMethod: opts.authMethod,
      credentialId: opts.credentialId ?? null,
    })
    .run();
  return token;
}

// Validate a token; slides the rolling expiry. Returns the session or null.
export function validateSession(db: DB, token: string, now: number): Session | null {
  const id = hashToken(token);
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) return null;
  if (row.expiresAt <= now || row.absoluteExpiresAt <= now) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }
  // Slide the rolling window, capped by the absolute expiry. Throttle writes to ~once/minute.
  if (now - row.lastSeenAt > 60_000) {
    const nextExpiry = Math.min(now + env.SESSION_TTL_DAYS * DAY_MS, row.absoluteExpiresAt);
    db.update(sessions)
      .set({ lastSeenAt: now, expiresAt: nextExpiry })
      .where(eq(sessions.id, id))
      .run();
  }
  return row;
}

export function revokeByToken(db: DB, token: string): void {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

export function revokeById(db: DB, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

export function revokeAllExcept(db: DB, currentId: string): void {
  db.delete(sessions).where(ne(sessions.id, currentId)).run();
}

export function listSessions(db: DB): Session[] {
  return db.select().from(sessions).all();
}

export function currentSessionId(token: string): string {
  return hashToken(token);
}

export function pruneExpiredSessions(db: DB, now: number): void {
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
}

// Cookie options shared by login (set) and logout (clear).
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: env.SESSION_TTL_DAYS * DAY_MS,
  };
}
