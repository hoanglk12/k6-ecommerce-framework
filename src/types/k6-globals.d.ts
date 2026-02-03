/**
 * Global type declarations for k6 runtime
 * 
 * This file declares global objects and functions that are available
 * in the k6 JavaScript runtime but not in standard TypeScript.
 */

/**
 * k6 console object for logging
 * Available globally in k6 runtime
 */
declare const console: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};

/**
 * Base64 encoding function (available in k6)
 */
declare function btoa(data: string): string;

/**
 * Base64 decoding function (available in k6)
 */
declare function atob(data: string): string;
