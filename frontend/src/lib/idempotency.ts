/**
 * Generates a cryptographically strong unique idempotency key
 * to uniquely identify a logical submission and allow safe retries.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'idem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}
