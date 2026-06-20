import fs from 'node:fs';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load env from the mounted config (production) or a local .env (dev), if present.
const configPath = process.env.CONFIG_PATH || '/run/config/.env';
if (fs.existsSync(configPath)) {
  dotenv.config({ path: configPath });
} else {
  dotenv.config();
}

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null ? def : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // qBittorrent
  QBIT_URL: z.string().url().default('http://qbittorrent:8080'),
  QBIT_USERNAME: z.string().default('admin'),
  QBIT_PASSWORD: z.string().default('adminadmin'),

  // Jackett (torrent search). Search is disabled when the API key is unset.
  JACKETT_URL: z.string().url().default('http://jackett:9117'),
  JACKETT_API_KEY: z.string().optional(),

  // Filesystem
  DOWNLOADS_PATH: z.string().default('/downloads'),
  DATA_DIR: z.string().default('/data'),

  // Web / CORS / WebAuthn relying party
  DOMAIN: z.string().optional(),
  ALLOWED_ORIGIN: z.string().optional(),
  RP_ID: z.string().optional(),
  RP_NAME: z.string().default('Torro'),

  // Auth
  APP_USERNAME: z.string().default('admin'),
  RECOVERY_PASSWORD_HASH: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().positive().default(7),
  SESSION_ABSOLUTE_TTL_DAYS: z.coerce.number().positive().default(30),
  COOKIE_SECURE: bool(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;
const isProd = e.NODE_ENV === 'production';

// Derive the WebAuthn relying-party id from RP_ID, else the DOMAIN host, else localhost.
function deriveRpId(): string {
  if (e.RP_ID) return e.RP_ID;
  if (e.DOMAIN) {
    try {
      const host = e.DOMAIN.includes('://') ? new URL(e.DOMAIN).hostname : e.DOMAIN;
      return host;
    } catch {
      return e.DOMAIN;
    }
  }
  return 'localhost';
}

// Origins the browser may present during a WebAuthn ceremony.
function deriveOrigins(): string[] {
  const origins = new Set<string>();
  if (e.ALLOWED_ORIGIN) origins.add(e.ALLOWED_ORIGIN);
  if (e.DOMAIN) origins.add(e.DOMAIN.includes('://') ? e.DOMAIN : `https://${e.DOMAIN}`);
  if (!isProd) {
    origins.add('http://localhost:5173');
    origins.add('http://localhost:8080');
    origins.add('http://localhost:3000');
  }
  return [...origins];
}

export const env = {
  ...e,
  isProd,
  // Torrent search is available only when a Jackett API key is configured.
  jackettEnabled: !!e.JACKETT_API_KEY,
  // COOKIE_SECURE defaults to true but is forced off in non-prod so cookies work over http://localhost.
  cookieSecure: isProd ? e.COOKIE_SECURE : false,
  rpId: deriveRpId(),
  rpName: e.RP_NAME,
  expectedOrigins: deriveOrigins(),
  dbPath: `${e.DATA_DIR.replace(/\/$/, '')}/torro.db`,
};

export type Env = typeof env;
