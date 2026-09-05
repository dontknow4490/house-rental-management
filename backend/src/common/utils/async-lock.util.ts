import * as crypto from 'crypto';

/**
 * Key-based asynchronous mutual exclusion lock for serializing concurrent
 * operations sharing the same logical identity / idempotency key.
 */
export class AsyncLock {
  private queues = new Map<string, Promise<any>>();

  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const currentQueue = this.queues.get(key) || Promise.resolve();

    let release: () => void;
    const nextQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.queues.set(key, nextQueue);

    try {
      await currentQueue;
      return await fn();
    } finally {
      release!();
      if (this.queues.get(key) === nextQueue) {
        this.queues.delete(key);
      }
    }
  }
}

export const financialMutationLock = new AsyncLock();

export interface IdempotencyEntry<T = any> {
  result: T;
  createdAt: number;
  expiresAt: number;
}

/**
 * In-memory idempotency cache keyed by scope, authenticated actor/tenant, and client idempotencyKey.
 * Guarantees that retries with the SAME key return the original response without re-executing mutations.
 * Allows distinct transactions with DIFFERENT keys to proceed immediately without false content deduplication.
 */
export class IdempotencyStore {
  private cache = new Map<string, IdempotencyEntry>();
  private readonly defaultTtlMs = 24 * 60 * 60 * 1000; // 24 hours
  private readonly maxEntries = 10000;

  get<T>(scope: string, actorId: string, key?: string): T | null {
    if (!key || !key.trim()) return null;
    const compoundKey = `${scope}:${actorId}:${key.trim()}`;
    const entry = this.cache.get(compoundKey);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(compoundKey);
      return null;
    }
    return entry.result as T;
  }

  set<T>(scope: string, actorId: string, key: string | undefined, result: T, ttlMs = this.defaultTtlMs): void {
    if (!key || !key.trim()) return;
    const compoundKey = `${scope}:${actorId}:${key.trim()}`;
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(compoundKey, {
      result,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
  }

  has(scope: string, actorId: string, key?: string): boolean {
    return this.get(scope, actorId, key) !== null;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const idempotencyStore = new IdempotencyStore();

/**
 * Executes a financial mutation with true client-driven idempotency protection:
 * 1. Checks if a previous response was already cached for (scope, actorId, idempotencyKey).
 * 2. Serializes same-key concurrent executions via AsyncLock.
 * 3. Double-checks the cache inside the lock.
 * 4. Executes the business operation and caches the result.
 * 5. Requests with different idempotency keys run as separate legitimate transactions.
 */
export async function executeWithIdempotency<T>(
  scope: string,
  actorId: string,
  idempotencyKey: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  const trimmedKey = idempotencyKey?.trim();

  // If no idempotencyKey is supplied, run directly under transient lock (no caching)
  if (!trimmedKey) {
    const transientKey = `${scope}:${actorId}:${crypto.randomUUID()}`;
    return await financialMutationLock.acquire(transientKey, operation);
  }

  // 1. Fast path: check if request was already processed
  const cached = idempotencyStore.get<T>(scope, actorId, trimmedKey);
  if (cached) {
    return cached;
  }

  // 2. Lock path: serialize concurrent identical requests
  const lockKey = `${scope}:${actorId}:${trimmedKey}`;
  return await financialMutationLock.acquire(lockKey, async () => {
    // Double-check inside lock
    const cachedInside = idempotencyStore.get<T>(scope, actorId, trimmedKey);
    if (cachedInside) {
      return cachedInside;
    }

    const result = await operation();
    idempotencyStore.set<T>(scope, actorId, trimmedKey, result);
    return result;
  });
}
