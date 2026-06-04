import type { DB } from '../db/index.js';
import { auditLog } from '../db/schema.js';

// Append an audit entry. `detail` must never contain secrets.
export function audit(
  db: DB,
  event: string,
  opts: { ip?: string | null; detail?: Record<string, unknown> } = {}
): void {
  db.insert(auditLog)
    .values({
      ts: Date.now(),
      event,
      ip: opts.ip ?? null,
      detail: opts.detail ? JSON.stringify(opts.detail) : null,
    })
    .run();
}
