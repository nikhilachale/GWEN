// src/skills/retry.ts — Smart retry logic with exponential backoff
// Provides structured retry mechanisms for API calls and tool execution
// with configurable policies, jitter, and provider-specific settings.

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxAttempts: number;        // Maximum number of retry attempts
  baseDelay: number;           // Base delay in milliseconds
  maxDelay: number;            // Maximum delay between retries
  jitterAmount?: number;       // Random jitter to add (default: baseDelay * 0.1)
  backoffMultiplier?: number; // Exponential backoff multiplier (default: 2)
  retryableErrors?: string[];  // Error types that should trigger retries
}

/**
 * Default retry policies for different providers
 */
export const DEFAULT_POLICIES: Record<string, RetryPolicy> = {
  anthropic: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    jitterAmount: 200,
    retryableErrors: ['rate_limit', 'timeout', 'connection_error', 'server_error'],
  },
  groq: {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 5000,
    jitterAmount: 100,
    retryableErrors: ['rate_limit', 'timeout', 'connection_error', 'server_error'],
  },
  openai: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    jitterAmount: 200,
    retryableErrors: ['rate_limit', 'timeout', 'connection_error', 'server_error'],
  },
  fish: {
    maxAttempts: 2,
    baseDelay: 300,
    maxDelay: 2000,
    jitterAmount: 50,
    retryableErrors: ['timeout', 'connection_error'],
  },
  default: {
    maxAttempts: 2,
    baseDelay: 500,
    maxDelay: 5000,
    jitterAmount: 100,
    retryableErrors: ['timeout', 'connection_error'],
  },
};

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  policy: RetryPolicy
): number {
  const multiplier = policy.backoffMultiplier || 2;
  const exponentialDelay = policy.baseDelay * Math.pow(multiplier, attempt);

  // Add jitter to prevent thundering herd
  const jitter = policy.jitterAmount
    ? Math.random() * policy.jitterAmount
    : Math.random() * (policy.baseDelay * 0.1);

  const delay = Math.min(exponentialDelay + jitter, policy.maxDelay);
  return Math.floor(delay);
}

/**
 * Check if an error is retryable based on policy
 */
function isRetryableError(error: any, policy: RetryPolicy): boolean {
  if (!policy.retryableErrors || policy.retryableErrors.length === 0) {
    return true; // Retry all errors if not specified
  }

  const errorMessage = (error?.message || String(error)).toLowerCase();
  const errorType = (error?.type || error?.code || '').toLowerCase();

  // Check error type/code
  for (const retryable of policy.retryableErrors) {
    if (errorType.includes(retryable.toLowerCase())) {
      return true;
    }
  }

  // Check error message patterns
  const patterns: Record<string, string[]> = {
    rate_limit: ['rate limit', '429', 'too many requests'],
    timeout: ['timeout', 'timed out', 'etimed'],
    connection_error: ['econnrefused', 'econnreset', 'enotfound', 'connection'],
    server_error: ['500', '502', '503', '504', 'internal error'],
  };

  for (const [key, keywords] of Object.entries(patterns)) {
    if (policy.retryableErrors.includes(key)) {
      for (const keyword of keywords) {
        if (errorMessage.includes(keyword)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Execute a function with retry logic
 * @param fn - Function to execute (should return a Promise)
 * @param policy - Retry policy configuration
 * @param onRetry - Optional callback called before each retry
 * @returns Promise with the result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_POLICIES.default,
  onRetry?: (attempt: number, error: any, delay: number) => void
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if this is the last attempt or error is not retryable
      const isLastAttempt = attempt >= policy.maxAttempts - 1;
      if (isLastAttempt || !isRetryableError(error, policy)) {
        throw error;
      }

      // Calculate delay and wait before retry
      const delay = calculateDelay(attempt, policy);

      // Call retry callback if provided
      if (onRetry) {
        try {
          onRetry(attempt + 1, error, delay);
        } catch {}
      }

      // Log retry attempt
      console.warn(
        `[retry] attempt ${attempt + 1}/${policy.maxAttempts} failed, ` +
        `retrying in ${delay}ms: ${error?.message || error}`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Execute a function with retry for a specific provider
 * @param provider - Provider name (anthropic, groq, openai, fish)
 * @param fn - Function to execute
 * @param onRetry - Optional callback called before each retry
 * @returns Promise with the result of the function
 */
export async function withRetryForProvider<T>(
  provider: string,
  fn: () => Promise<T>,
  onRetry?: (attempt: number, error: any, delay: number) => void
): Promise<T> {
  const policy = DEFAULT_POLICIES[provider] || DEFAULT_POLICIES.default;
  return withRetry(fn, policy, onRetry);
}

/**
 * Create a retryable function wrapper
 * @param fn - Function to wrap
 * @param policyOrProvider - Retry policy or provider name
 * @returns Wrapped function with retry logic
 */
export function wrapRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  policyOrProvider: string | RetryPolicy = DEFAULT_POLICIES.default
): T {
  const policy =
    typeof policyOrProvider === 'string'
      ? (DEFAULT_POLICIES[policyOrProvider] || DEFAULT_POLICIES.default)
      : policyOrProvider;

  return (async (...args: any[]) => {
    return withRetry(() => fn(...args), policy);
  }) as T;
}

/**
 * Retry metrics for monitoring
 */
export interface RetryMetrics {
  attempts: number;
  totalDelay: number;
  success: boolean;
  errorType?: string;
}

/**
 * Execute with retry and return metrics
 */
export async function withRetryMetrics<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_POLICIES.default
): Promise<{ result: T; metrics: RetryMetrics }> {
  const startTime = Date.now();
  let attempts = 0;
  let totalDelay = 0;
  let success = false;
  let errorType: string | undefined;

  try {
    const result = await withRetry(fn, policy, (attempt, error, delay) => {
      attempts = attempt;
      totalDelay += delay;
      errorType = error?.type || error?.code || 'unknown';
    });

    success = true;
    return { result, metrics: { attempts, totalDelay, success, errorType } };
  } catch (error) {
    attempts++;
    return {
      result: null as T,
      metrics: {
        attempts,
        totalDelay,
        success: false,
        errorType: errorType || (error as any)?.type || 'unknown',
      },
    };
  }
}
