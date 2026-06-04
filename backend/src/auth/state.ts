import { eq } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { authState } from '../db/schema.js';

// Typed key/value accessor over the auth_state singleton table.
export const AUTH_KEYS = {
  recoveryPasswordHash: 'recovery_password_hash',
  failedAttempts: 'failed_attempts',
  lockedUntil: 'locked_until',
} as const;

export function getState(db: DB, key: string): string | undefined {
  const row = db.select().from(authState).where(eq(authState.key, key)).get();
  return row?.value ?? undefined;
}

export function setState(db: DB, key: string, value: string | null): void {
  db.insert(authState)
    .values({ key, value })
    .onConflictDoUpdate({ target: authState.key, set: { value } })
    .run();
}

// Seed the recovery password hash from env on first boot only (env stops being the source of truth).
export function seedRecoveryHash(db: DB, envHash: string | undefined): void {
  if (!envHash) return;
  const existing = getState(db, AUTH_KEYS.recoveryPasswordHash);
  if (!existing) setState(db, AUTH_KEYS.recoveryPasswordHash, envHash);
}
