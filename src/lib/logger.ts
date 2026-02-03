/**
 * Logger Utility Module
 * 
 * Provides consistent, configurable logging throughout the framework
 * with support for different log levels, VU context, and structured data.
 */

import exec from 'k6/execution';
import { LoggerConfig } from '../types';

// ============================================================================
// LOG LEVELS
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================================
// LOGGER CLASS
// ============================================================================

/**
 * Logger class for consistent logging throughout the framework
 */
export class Logger {
  private readonly config: LoggerConfig;
  private readonly prefix: string;

  constructor(config: Partial<LoggerConfig> = {}, prefix = '') {
    this.config = {
      level: config.level ?? 'info',
      timestamps: config.timestamps ?? true,
      includeVU: config.includeVU ?? true,
      prettyPrint: config.prettyPrint ?? false,
    };
    this.prefix = prefix;
  }

  /**
   * Create a child logger with a prefix
   */
  child(prefix: string): Logger {
    const newPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger(this.config, newPrefix);
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Internal logging method
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    // Check if this level should be logged
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return;
    }

    const parts: string[] = [];

    // Add timestamp
    if (this.config.timestamps) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    // Add log level
    parts.push(`[${level.toUpperCase()}]`);

    // Add VU context
    if (this.config.includeVU) {
      try {
        const vuId = exec.vu.idInTest;
        const iteration = exec.scenario.iterationInTest;
        // Check if values are actually defined
        if (vuId !== undefined && iteration !== undefined) {
          parts.push(`[VU:${vuId}:${iteration}]`);
        } else {
          parts.push('[VU:N/A]');
        }
      } catch {
        // VU context not available (e.g., in setup/teardown)
        parts.push('[VU:N/A]');
      }
    }

    // Add prefix
    if (this.prefix) {
      parts.push(`[${this.prefix}]`);
    }

    // Add message
    parts.push(message);

    // Add data
    if (data) {
      const dataStr = this.config.prettyPrint
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);
      parts.push(dataStr);
    }

    // Output the log
    const output = parts.join(' ');
    
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }
}

// ============================================================================
// SINGLETON LOGGER
// ============================================================================

let defaultLogger: Logger | null = null;

/**
 * Get or create the default logger instance
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!defaultLogger || config) {
    defaultLogger = new Logger(config);
  }
  return defaultLogger;
}

/**
 * Create a named logger for a specific module
 */
export function createLogger(name: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger(config, name);
}
