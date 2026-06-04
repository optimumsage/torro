import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/index.js';
import { SESSION_COOKIE, validateSession } from '../auth/session.js';
import { unauthorized } from '../utils/errors.js';

// Attach a valid session to the request or 401.
export function requireSession(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next(unauthorized());
  const session = validateSession(getDb(), token, Date.now());
  if (!session) return next(unauthorized());
  req.session = session;
  req.sessionToken = token;
  next();
}
