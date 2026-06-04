import rateLimit from 'express-rate-limit';

// Disable IP-based limiting under test (in-memory state is shared across app instances).
// The DB-backed lockout in auth/password.ts is still exercised by tests.
const skip = () => process.env.NODE_ENV === 'test';

// Strict limiter for auth ceremonies (login, passkey challenge/verify).
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many attempts — please wait and try again' },
});

// Looser limiter for general API traffic.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many requests' },
});
