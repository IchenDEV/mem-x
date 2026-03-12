/**
 * Retry utilities with exponential backoff.
 */

export interface RetryOptions {
  maxAttempts?: number;
  backoffMs?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Execute a function with retry and exponential backoff.
 * Returns { ok: true, data } on success, { ok: false, error } on failure.
 * 
 * @example
 * const result = await withRetry(() => fetchData());
 * if (!result.ok) {
 *   console.error(result.error.message);
 * }
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<{ ok: true; data: T } | { ok: false; error: Error }> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const backoffMs = opts?.backoffMs ?? 1000;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const data = await fn();
      return { ok: true, data };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      
      if (i === maxAttempts - 1) {
        return { ok: false, error };
      }
      
      opts?.onRetry?.(error, i + 1);
      
      // Exponential backoff: 1s, 2s, 4s, ...
      const delay = backoffMs * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { ok: false, error: new Error('Max retries exceeded') };
}

/**
 * Synchronous version of withRetry.
 */
export function withRetrySync<T>(
  fn: () => T,
  opts?: RetryOptions,
): { ok: true; data: T } | { ok: false; error: Error } {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const backoffMs = opts?.backoffMs ?? 1000;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const data = fn();
      return { ok: true, data };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      
      if (i === maxAttempts - 1) {
        return { ok: false, error };
      }
      
      opts?.onRetry?.(error, i + 1);
      
      // Synchronous sleep is not recommended, but we provide a basic implementation
      const start = Date.now();
      while (Date.now() - start < backoffMs * Math.pow(2, i)) {
        // busy wait - not ideal but works synchronously
      }
    }
  }

  return { ok: false, error: new Error('Max retries exceeded') };
}
