import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { env } from '../env.js';
import { validate } from '../middleware/validate.js';
import { requireSession } from '../middleware/requireSession.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  SESSION_COOKIE,
  createSession,
  validateSession,
  revokeByToken,
  revokeById,
  revokeAllExcept,
  listSessions,
  sessionCookieOptions,
} from '../auth/session.js';
import {
  CHALLENGE_COOKIE,
  startRegistration,
  finishRegistration,
  startAuthentication,
  finishAuthentication,
  countCredentials,
  listCredentials,
  deleteCredential,
} from '../auth/passkeys.js';
import {
  verifyRecoveryPassword,
  recoveryPasswordIsSet,
  isLockedOut,
} from '../auth/password.js';
import { audit } from '../auth/audit.js';
import { badRequest, forbidden, tooManyRequests, unauthorized } from '../utils/errors.js';

const router = Router();
const CHALLENGE_MAX_AGE = 5 * 60 * 1000;

function setChallengeCookie(res: Response, id: string): void {
  res.cookie(CHALLENGE_COOKIE, id, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: CHALLENGE_MAX_AGE,
  });
}

function startSession(
  req: Request,
  res: Response,
  authMethod: 'passkey' | 'recovery',
  credentialId?: string | null
): void {
  const token = createSession(getDb(), Date.now(), {
    authMethod,
    credentialId,
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip ?? null,
  });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

function sessionFromCookie(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE];
  return token ? validateSession(getDb(), token, Date.now()) : null;
}

// --- Public state -----------------------------------------------------------

router.get('/state', (req, res) => {
  const db = getDb();
  res.json({
    hasPasskeys: countCredentials(db) > 0,
    recoveryEnabled: recoveryPasswordIsSet(db),
    authenticated: !!sessionFromCookie(req),
  });
});

router.get('/me', (req, res) => {
  const db = getDb();
  const session = sessionFromCookie(req);
  res.json({
    authenticated: !!session,
    username: session ? env.APP_USERNAME : null,
    needsEnrollment: countCredentials(db) === 0,
    authMethod: session?.authMethod ?? null,
  });
});

// --- Recovery password login ------------------------------------------------

router.post(
  '/login',
  authLimiter,
  validate({ body: z.object({ username: z.string().min(1), password: z.string().min(1) }) }),
  async (req, res) => {
    const db = getDb();
    const now = Date.now();
    if (isLockedOut(db, now)) {
      throw tooManyRequests('Too many failed attempts — try again later');
    }
    const { username, password } = req.valid!.body as { username: string; password: string };
    const ok = await verifyRecoveryPassword(db, username, password, env.APP_USERNAME, now);
    if (!ok) {
      audit(db, 'login.fail', { ip: req.ip, detail: { method: 'recovery' } });
      throw unauthorized('Invalid credentials');
    }
    startSession(req, res, 'recovery');
    audit(db, 'login.success', { ip: req.ip, detail: { method: 'recovery' } });
    res.json({ ok: true });
  }
);

// --- Passkey authentication -------------------------------------------------

router.post('/authenticate/options', authLimiter, async (req, res) => {
  const { options, challengeId } = await startAuthentication(getDb());
  setChallengeCookie(res, challengeId);
  res.json(options);
});

router.post(
  '/authenticate/verify',
  authLimiter,
  validate({ body: z.object({ response: z.any() }) }),
  async (req, res) => {
    const db = getDb();
    const challengeId = req.cookies?.[CHALLENGE_COOKIE];
    const { response } = req.valid!.body as { response: any };
    const cred = await finishAuthentication(db, challengeId, response);
    res.clearCookie(CHALLENGE_COOKIE, { path: '/' });
    startSession(req, res, 'passkey', cred.id);
    audit(db, 'login.success', { ip: req.ip, detail: { method: 'passkey', credentialId: cred.id } });
    res.json({ ok: true });
  }
);

// --- Passkey registration ---------------------------------------------------
// First passkey: gated by the recovery password. Subsequent: requires a session.

router.post(
  '/register/options',
  authLimiter,
  validate({ body: z.object({ password: z.string().optional() }).optional() }),
  async (req, res) => {
    const db = getDb();
    const now = Date.now();
    const isFirst = countCredentials(db) === 0;

    if (isFirst) {
      const body = (req.valid?.body as { password?: string } | undefined) ?? {};
      if (isLockedOut(db, now)) throw tooManyRequests('Too many failed attempts — try again later');
      const ok =
        !!body.password &&
        (await verifyRecoveryPassword(db, env.APP_USERNAME, body.password, env.APP_USERNAME, now));
      if (!ok) {
        audit(db, 'enroll.gate.fail', { ip: req.ip });
        throw unauthorized('Recovery password required to enroll the first passkey');
      }
    } else if (!sessionFromCookie(req)) {
      throw unauthorized('Sign in to add another passkey');
    }

    const { options, challengeId } = await startRegistration(db);
    setChallengeCookie(res, challengeId);
    res.json(options);
  }
);

router.post(
  '/register/verify',
  authLimiter,
  validate({ body: z.object({ response: z.any(), label: z.string().max(64).optional() }) }),
  async (req, res) => {
    const db = getDb();
    const challengeId = req.cookies?.[CHALLENGE_COOKIE];
    const { response, label } = req.valid!.body as { response: any; label?: string };
    const wasFirst = countCredentials(db) === 0;

    // Only the recovery-gated (first) or already-authenticated paths can hold a valid challenge,
    // but re-check the session for non-first registrations to be safe.
    if (!wasFirst && !sessionFromCookie(req)) throw unauthorized('Sign in to add another passkey');

    const cred = await finishRegistration(db, challengeId, response, label ?? 'Passkey');
    res.clearCookie(CHALLENGE_COOKIE, { path: '/' });
    audit(db, 'passkey.register', { ip: req.ip, detail: { credentialId: cred.id, label: cred.label } });

    // Enrolling the very first passkey logs the user in immediately.
    if (wasFirst) startSession(req, res, 'passkey', cred.id);
    res.json({ id: cred.id, label: cred.label, createdAt: cred.createdAt });
  }
);

// --- Logout -----------------------------------------------------------------

router.post('/logout', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) revokeByToken(getDb(), token);
  res.clearCookie(SESSION_COOKIE, { path: '/' }).json({ ok: true });
});

// --- Passkey management (authenticated) -------------------------------------

router.get('/passkeys', requireSession, (_req, res) => {
  const creds = listCredentials(getDb());
  res.json(
    creds.map((c) => ({
      id: c.id,
      label: c.label,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
      backedUp: c.backedUp,
    }))
  );
});

router.delete(
  '/passkeys/:id',
  requireSession,
  validate({ params: z.object({ id: z.string().min(1) }) }),
  (req, res) => {
    const db = getDb();
    const creds = listCredentials(db);
    if (!creds.some((c) => c.id === String(req.params.id))) throw badRequest('Unknown passkey');
    // Don't allow removing the last passkey unless a recovery password exists.
    if (creds.length === 1 && !recoveryPasswordIsSet(db)) {
      throw forbidden('Set a recovery password before removing your last passkey');
    }
    deleteCredential(db, String(req.params.id));
    audit(db, 'passkey.delete', { ip: req.ip, detail: { credentialId: String(req.params.id) } });
    res.json({ ok: true });
  }
);

// --- Session management (authenticated) -------------------------------------

router.get('/sessions', requireSession, (req, res) => {
  const currentId = req.session!.id;
  res.json(
    listSessions(getDb()).map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      userAgent: s.userAgent,
      ip: s.ip,
      authMethod: s.authMethod,
      current: s.id === currentId,
    }))
  );
});

router.delete(
  '/sessions/:id',
  requireSession,
  validate({ params: z.object({ id: z.string().min(1) }) }),
  (req, res) => {
    revokeById(getDb(), String(req.params.id));
    res.json({ ok: true });
  }
);

router.post('/sessions/revoke-others', requireSession, (req, res) => {
  revokeAllExcept(getDb(), req.session!.id);
  res.json({ ok: true });
});

export default router;
