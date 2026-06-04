import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';

// Registered WebAuthn passkeys. Single user, but multiple credentials allowed.
export const webauthnCredentials = sqliteTable('webauthn_credentials', {
  id: text('id').primaryKey(), // base64url credential ID
  publicKey: blob('public_key', { mode: 'buffer' }).notNull(), // COSE public key bytes
  counter: integer('counter').notNull().default(0),
  transports: text('transports'), // JSON array, e.g. ["internal","hybrid"]
  deviceType: text('device_type'), // singleDevice | multiDevice
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
  label: text('label').notNull().default('Passkey'),
  createdAt: integer('created_at').notNull(),
  lastUsedAt: integer('last_used_at'),
});

// Server-side sessions (opaque, revocable). id = sha256(token).
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  absoluteExpiresAt: integer('absolute_expires_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  userAgent: text('user_agent'),
  ip: text('ip'),
  authMethod: text('auth_method').notNull(), // passkey | recovery
  credentialId: text('credential_id'),
});

// Ephemeral WebAuthn ceremony challenges. Keyed by a short-lived cookie id.
export const webauthnChallenges = sqliteTable('webauthn_challenges', {
  id: text('id').primaryKey(),
  challenge: text('challenge').notNull(),
  type: text('type').notNull(), // registration | authentication
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

// Singleton key/value store for the single user's auth state (recovery hash + lockout).
export const authState = sqliteTable('auth_state', {
  key: text('key').primaryKey(),
  value: text('value'),
});

// Lightweight audit trail. Never stores secrets.
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: integer('ts').notNull(),
  event: text('event').notNull(),
  detail: text('detail'),
  ip: text('ip'),
});

export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type WebauthnChallenge = typeof webauthnChallenges.$inferSelect;
