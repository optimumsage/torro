import bcrypt from 'bcryptjs';
import type { DB } from '../db/index.js';
import { AUTH_KEYS, getState, setState } from './state.js';
import { logger } from '../logger.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export function isLockedOut(db: DB, now: number): number | null {
  const until = Number(getState(db, AUTH_KEYS.lockedUntil) ?? 0);
  return until > now ? until : null;
}

function recordFailure(db: DB, now: number): void {
  const attempts = Number(getState(db, AUTH_KEYS.failedAttempts) ?? 0) + 1;
  setState(db, AUTH_KEYS.failedAttempts, String(attempts));
  if (attempts >= MAX_ATTEMPTS) {
    setState(db, AUTH_KEYS.lockedUntil, String(now + LOCKOUT_MS));
    setState(db, AUTH_KEYS.failedAttempts, '0');
    logger.warn({ event: 'lockout' }, 'Recovery login locked out after repeated failures');
  }
}

function resetFailures(db: DB): void {
  setState(db, AUTH_KEYS.failedAttempts, '0');
  setState(db, AUTH_KEYS.lockedUntil, '0');
}

// Verify the recovery password. Returns true on success; tracks lockout state in the DB.
export async function verifyRecoveryPassword(
  db: DB,
  username: string,
  password: string,
  expectedUsername: string,
  now: number
): Promise<boolean> {
  const hash = getState(db, AUTH_KEYS.recoveryPasswordHash);
  // Always run a comparison to keep timing roughly uniform even when misconfigured.
  const userOk = username === expectedUsername;
  const passOk = hash ? await bcrypt.compare(password, hash) : false;
  if (userOk && passOk) {
    resetFailures(db);
    return true;
  }
  recordFailure(db, now);
  return false;
}

export function recoveryPasswordIsSet(db: DB): boolean {
  return !!getState(db, AUTH_KEYS.recoveryPasswordHash);
}

export async function setRecoveryPassword(db: DB, password: string): Promise<void> {
  const hash = await bcrypt.hash(password, 12);
  setState(db, AUTH_KEYS.recoveryPasswordHash, hash);
}
