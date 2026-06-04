import crypto from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { eq, lt } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { webauthnCredentials, webauthnChallenges, type WebauthnCredential } from '../db/schema.js';
import { env } from '../env.js';
import { AppError, badRequest } from '../utils/errors.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
// Stable single-user handle (WebAuthn user.id). Constant because there is exactly one user.
const USER_HANDLE = new TextEncoder().encode('torro-user');
const USER_NAME = () => env.APP_USERNAME;

export const CHALLENGE_COOKIE = 'torro_webauthn';

function now() {
  return Date.now();
}

function storeChallenge(db: DB, challenge: string, type: 'registration' | 'authentication'): string {
  const id = crypto.randomBytes(24).toString('base64url');
  const t = now();
  db.insert(webauthnChallenges)
    .values({ id, challenge, type, createdAt: t, expiresAt: t + CHALLENGE_TTL_MS })
    .run();
  return id;
}

// Fetch + delete a challenge in one shot (single-use). Throws if missing/expired/wrong type.
function consumeChallenge(db: DB, id: string | undefined, type: 'registration' | 'authentication'): string {
  if (!id) throw badRequest('Missing challenge');
  const row = db.select().from(webauthnChallenges).where(eq(webauthnChallenges.id, id)).get();
  if (row) db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, id)).run();
  if (!row || row.type !== type || row.expiresAt <= now()) {
    throw badRequest('Challenge expired — please try again');
  }
  return row.challenge;
}

export function countCredentials(db: DB): number {
  return db.select().from(webauthnCredentials).all().length;
}

export function listCredentials(db: DB): WebauthnCredential[] {
  return db.select().from(webauthnCredentials).all();
}

export function deleteCredential(db: DB, id: string): void {
  db.delete(webauthnCredentials).where(eq(webauthnCredentials.id, id)).run();
}

function parseTransports(value: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as AuthenticatorTransportFuture[];
  } catch {
    return undefined;
  }
}

// --- Registration -----------------------------------------------------------

export async function startRegistration(
  db: DB
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }> {
  const existing = listCredentials(db);
  const options = await generateRegistrationOptions({
    rpName: env.rpName,
    rpID: env.rpId,
    userID: USER_HANDLE,
    userName: USER_NAME(),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: parseTransports(c.transports),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  const challengeId = storeChallenge(db, options.challenge, 'registration');
  return { options, challengeId };
}

export async function finishRegistration(
  db: DB,
  challengeId: string | undefined,
  response: RegistrationResponseJSON,
  label: string
): Promise<WebauthnCredential> {
  const expectedChallenge = consumeChallenge(db, challengeId, 'registration');
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.expectedOrigins,
    expectedRPID: env.rpId,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw badRequest('Passkey registration could not be verified');
  }
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const t = now();
  const row = {
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    label: label.trim() || 'Passkey',
    createdAt: t,
    lastUsedAt: null,
  };
  db.insert(webauthnCredentials).values(row).run();
  return row as WebauthnCredential;
}

// --- Authentication ---------------------------------------------------------

export async function startAuthentication(
  db: DB
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }> {
  // Empty allowCredentials → discoverable/resident credential flow (Bitwarden shows its picker)
  // and avoids leaking which credentials exist.
  const options = await generateAuthenticationOptions({
    rpID: env.rpId,
    userVerification: 'preferred',
    allowCredentials: [],
  });
  const challengeId = storeChallenge(db, options.challenge, 'authentication');
  return { options, challengeId };
}

export async function finishAuthentication(
  db: DB,
  challengeId: string | undefined,
  response: AuthenticationResponseJSON
): Promise<WebauthnCredential> {
  const expectedChallenge = consumeChallenge(db, challengeId, 'authentication');
  const cred = db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.id, response.id))
    .get();
  if (!cred) throw new AppError(401, 'Unknown passkey');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.expectedOrigins,
    expectedRPID: env.rpId,
    requireUserVerification: false,
    credential: {
      id: cred.id,
      publicKey: new Uint8Array(cred.publicKey),
      counter: cred.counter,
      transports: parseTransports(cred.transports),
    },
  });
  if (!verification.verified) throw new AppError(401, 'Passkey verification failed');

  const { newCounter } = verification.authenticationInfo;
  // Clone detection: a regression in a non-zero counter signals a possible cloned authenticator.
  // Many providers (incl. Bitwarden) always report 0 — don't flag the 0/0 case.
  if (cred.counter !== 0 && newCounter !== 0 && newCounter <= cred.counter) {
    throw new AppError(401, 'Passkey counter anomaly — authentication rejected');
  }
  db.update(webauthnCredentials)
    .set({ counter: newCounter, lastUsedAt: now() })
    .where(eq(webauthnCredentials.id, cred.id))
    .run();
  return cred;
}

export function pruneExpiredChallenges(db: DB, ts: number): void {
  db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, ts)).run();
}
