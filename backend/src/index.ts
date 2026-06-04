import http from 'node:http';
import { env } from './env.js';
import { logger } from './logger.js';
import { initDb } from './db/index.js';
import { seedRecoveryHash } from './auth/state.js';
import { initQbit } from './services/qbit.js';
import { pruneExpiredSessions } from './auth/session.js';
import { pruneExpiredChallenges } from './auth/passkeys.js';
import { pruneHlsCache } from './services/mediaCache.js';
import { cleanupSessions } from './services/transcode.js';
import { createApp } from './app.js';
import { setupProgressWs } from './realtime/progressWs.js';

async function main(): Promise<void> {
  const db = initDb(env.dbPath);
  seedRecoveryHash(db, env.RECOVERY_PASSWORD_HASH);
  initQbit(env.QBIT_URL, env.QBIT_USERNAME, env.QBIT_PASSWORD);

  // Periodically prune expired sessions and ceremony challenges.
  setInterval(() => {
    const now = Date.now();
    pruneExpiredSessions(db, now);
    pruneExpiredChallenges(db, now);
    cleanupSessions();
    pruneHlsCache();
  }, 60 * 60 * 1000).unref();

  const app = createApp();
  const server = http.createServer(app);
  setupProgressWs(server);

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, rpId: env.rpId }, 'Torro backend running');
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
