import type { Session } from '../db/schema.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: Session;
      sessionToken?: string;
      valid?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

export {};
