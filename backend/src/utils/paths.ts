import path from 'node:path';

// Resolve `target` within `base`, throwing if it escapes the base directory.
export function safeJoin(base: string, target: string): string {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}
