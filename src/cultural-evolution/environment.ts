/**
 * Cultural Evolution — Injectable Environment Abstraction
 *
 * Wraps all environment-specific dependencies (time, randomness) in an
 * injectable interface per CLAUDE.md coding standards. This ensures all
 * environment interactions are mockable in tests.
 */

/**
 * Injectable environment interface for time and randomness.
 * All cultural-evolution modules must use this instead of
 * direct `new Date()`, `Date.now()`, or `Math.random()` calls.
 */
export interface ICulturalEnvironment {
  /** Returns the current timestamp as an ISO-8601 string */
  nowTimestamp(): string;

  /** Returns the current time in milliseconds since epoch (replaces Date.now()) */
  nowMillis(): number;

  /** Returns a pseudo-random number in [0, 1) (replaces Math.random()) */
  random(): number;
}

/**
 * Production environment — delegates to real system APIs.
 */
export class DefaultCulturalEnvironment implements ICulturalEnvironment {
  nowTimestamp(): string {
    return new Date().toISOString();
  }

  nowMillis(): number {
    return Date.now();
  }

  random(): number {
    return Math.random();
  }
}
