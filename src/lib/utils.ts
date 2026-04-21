/**
 * Utility Functions Module
 * 
 * Common utility functions used throughout the framework including:
 * - Random data generation
 * - Sleep/delay helpers
 * - Data transformation
 * - Validation helpers
 */

import { sleep } from 'k6';
import exec from 'k6/execution';
import { EnvironmentConfig } from '../types';

// @ts-expect-error - k6 remote module import
import { randomIntBetween, randomString, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ============================================================================
// SLEEP HELPERS
// ============================================================================

/**
 * Sleep for a random duration within the configured think time range
 * 
 * @param config - Environment configuration with think time settings
 */
export function thinkTime(config: EnvironmentConfig): void {
  const [min, max] = config.thinkTime;
  const duration = randomIntBetween(min * 1000, max * 1000) / 1000;
  sleep(duration);
}

/**
 * Sleep for a fixed duration in seconds
 * 
 * @param seconds - Duration to sleep
 */
export function sleepSeconds(seconds: number): void {
  sleep(seconds);
}

/**
 * Sleep for a random duration between min and max seconds
 * 
 * @param min - Minimum seconds
 * @param max - Maximum seconds
 */
export function sleepBetween(min: number, max: number): void {
  sleep(randomIntBetween(min * 1000, max * 1000) / 1000);
}

// ============================================================================
// RANDOM DATA GENERATORS
// ============================================================================

/**
 * Generate a random email address unique to this VU and timestamp.
 * Including exec.vu.idInTest prevents collisions when multiple VUs run in the same millisecond.
 *
 * @param domain - Email domain (default: test.example.com)
 * @returns Random email address
 */
export function randomEmail(domain = 'test.example.com'): string {
  const timestamp = Date.now();
  const random = randomString(8).toLowerCase();
  const vuId = exec.vu.idInTest;
  return `test_${random}_${timestamp}_${vuId}@${domain}`;
}

/**
 * Generate a random Australian phone number
 * 
 * @returns Random phone number
 */
export function randomAustralianPhone(): string {
  const prefixes = ['0412', '0413', '0414', '0415', '0416', '0421', '0422', '0423'];
  const prefix = randomItem(prefixes);
  const number = randomIntBetween(100000, 999999);
  return `${prefix}${number}`;
}

/**
 * Generate a random Australian postcode
 * 
 * @param state - State abbreviation (optional)
 * @returns Random postcode
 */
export function randomAustralianPostcode(state?: string): string {
  const postcodeRanges: Record<string, [number, number]> = {
    'NSW': [2000, 2999],
    'VIC': [3000, 3999],
    'QLD': [4000, 4999],
    'SA': [5000, 5799],
    'WA': [6000, 6797],
    'TAS': [7000, 7799],
    'NT': [800, 899],
    'ACT': [2600, 2618],
  };

  if (state && postcodeRanges[state]) {
    const [min, max] = postcodeRanges[state];
    return String(randomIntBetween(min, max));
  }

  // Random state
  const states = Object.keys(postcodeRanges);
  const randomState = randomItem(states);
  const [min, max] = postcodeRanges[randomState];
  return String(randomIntBetween(min, max));
}

/**
 * Generate a random first name
 */
export function randomFirstName(): string {
  const names = [
    'James', 'Emma', 'Oliver', 'Charlotte', 'William', 'Amelia',
    'Jack', 'Mia', 'Noah', 'Olivia', 'Thomas', 'Ava', 'Henry',
    'Sophia', 'Lucas', 'Isla', 'Charlie', 'Grace', 'Oscar', 'Chloe'
  ];
  return randomItem(names);
}

/**
 * Generate a random last name
 */
export function randomLastName(): string {
  const names = [
    'Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor',
    'Johnson', 'White', 'Martin', 'Anderson', 'Thompson', 'Nguyen',
    'Thomas', 'Walker', 'Harris', 'Lee', 'Ryan', 'Robinson', 'Kelly', 'King'
  ];
  return randomItem(names);
}

/**
 * Generate a random street address
 */
export function randomStreetAddress(): string {
  const streetTypes = ['Street', 'Road', 'Avenue', 'Drive', 'Place', 'Court', 'Lane', 'Way'];
  const streetNames = [
    'High', 'Main', 'Park', 'Oak', 'George', 'King', 'Queen', 'Victoria',
    'Elizabeth', 'Beach', 'Hill', 'Lake', 'River', 'Forest', 'Garden'
  ];
  
  const number = randomIntBetween(1, 500);
  const streetName = randomItem(streetNames);
  const streetType = randomItem(streetTypes);
  
  return `${number} ${streetName} ${streetType}`;
}

/**
 * Generate a random Australian city
 * 
 * @param state - State abbreviation (optional)
 */
export function randomAustralianCity(state?: string): string {
  const citiesByState: Record<string, string[]> = {
    'NSW': ['Sydney', 'Newcastle', 'Wollongong', 'Parramatta', 'Central Coast'],
    'VIC': ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Shepparton'],
    'QLD': ['Brisbane', 'Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns'],
    'SA': ['Adelaide', 'Mount Gambier', 'Whyalla', 'Murray Bridge', 'Port Augusta'],
    'WA': ['Perth', 'Fremantle', 'Bunbury', 'Geraldton', 'Mandurah'],
    'TAS': ['Hobart', 'Launceston', 'Devonport', 'Burnie', 'Kingston'],
    'NT': ['Darwin', 'Alice Springs', 'Palmerston', 'Katherine', 'Tennant Creek'],
    'ACT': ['Canberra', 'Queanbeyan', 'Belconnen', 'Woden', 'Gungahlin'],
  };

  if (state && citiesByState[state]) {
    return randomItem(citiesByState[state]);
  }

  // Random state and city
  const allCities = Object.values(citiesByState).flat();
  return randomItem(allCities);
}

// ============================================================================
// DATA TRANSFORMATION HELPERS
// ============================================================================

/**
 * Deep clone an object
 * 
 * @param obj - Object to clone
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Safely get nested property from object
 * 
 * @param obj - Object to extract from
 * @param path - Dot-separated path
 * @param defaultValue - Default value if not found
 */
export function getNestedValue<T>(
  obj: unknown,
  path: string,
  defaultValue?: T
): T | undefined {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return defaultValue;
    }
    
    if (typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return defaultValue;
    }
  }

  return current as T;
}

/**
 * Remove null and undefined values from object
 * 
 * @param obj - Object to clean
 * @returns Cleaned object
 */
export function cleanObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  
  return result;
}

/** Cache formatters by currency code to avoid per-call allocations under high VU concurrency */
const _currencyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Format currency value
 *
 * @param value - Numeric value
 * @param currency - Currency code (default: AUD)
 */
export function formatCurrency(value: number, currency = 'AUD'): string {
  let formatter = _currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-AU', { style: 'currency', currency });
    _currencyFormatters.set(currency, formatter);
  }
  return formatter.format(value);
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate email format
 * 
 * @param email - Email to validate
 * @returns True if valid
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate Australian phone number
 * 
 * @param phone - Phone number to validate
 * @returns True if valid
 */
export function isValidAustralianPhone(phone: string): boolean {
  // Remove spaces and hyphens
  const cleaned = phone.replace(/[\s-]/g, '');
  // Australian mobile: 04XX XXX XXX or landline: 0X XXXX XXXX
  const phoneRegex = /^(04\d{8}|0[2-9]\d{8})$/;
  return phoneRegex.test(cleaned);
}

/**
 * Validate Australian postcode
 * 
 * @param postcode - Postcode to validate
 * @returns True if valid
 */
export function isValidAustralianPostcode(postcode: string): boolean {
  const postcodeNum = parseInt(postcode, 10);
  return postcodeNum >= 200 && postcodeNum <= 9999;
}

// ============================================================================
// EXECUTION HELPERS
// ============================================================================

/**
 * Get current VU (Virtual User) identifier
 */
export function getCurrentVU(): { vuId: number; iteration: number; scenario: string } {
  return {
    vuId: exec.vu.idInTest,
    iteration: exec.vu.iterationInScenario,
    scenario: exec.scenario.name,
  };
}

/**
 * Check if currently in setup or teardown phase
 */
export function isSetupOrTeardown(): boolean {
  try {
    // During setup/teardown, VU.idInTest is 0
    return exec.vu.idInTest === 0;
  } catch {
    return true;
  }
}

/**
 * Generate a unique identifier for this test run
 */
export function generateTestRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomString(6).toLowerCase();
  return `run_${timestamp}_${random}`;
}

// ============================================================================
// ENVIRONMENT HELPERS
// ============================================================================

/**
 * Get environment variable with default value
 * 
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set
 */
export function getEnvVar(name: string, defaultValue = ''): string {
  return __ENV[name] ?? defaultValue;
}

/**
 * Get boolean environment variable
 * 
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set
 */
export function getEnvBool(name: string, defaultValue = false): boolean {
  const value = __ENV[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get numeric environment variable
 * 
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set
 */
export function getEnvNumber(name: string, defaultValue = 0): number {
  const value = __ENV[name];
  if (!value) return defaultValue;
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

// ============================================================================
// TIMING HELPERS
// ============================================================================

/**
 * Measure execution time of a function
 * 
 * @param fn - Function to measure
 * @returns Result and duration in milliseconds
 */
export function measureTime<T>(fn: () => T): { result: T; duration: number } {
  const start = Date.now();
  const result = fn();
  const duration = Date.now() - start;
  return { result, duration };
}

/**
 * Create a simple timer
 */
export function createTimer(): { elapsed: () => number; reset: () => void } {
  let start = Date.now();
  
  return {
    elapsed: (): number => Date.now() - start,
    reset: (): void => { start = Date.now(); },
  };
}

// ============================================================================
// RETRY HELPERS
// ============================================================================

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Function to retry
 * @param maxRetries - Maximum retry attempts
 * @param initialDelay - Initial delay in ms
 */
export function withRetry<T>(
  fn: () => T,
  maxRetries = 3,
  initialDelay = 1000
): T {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        sleep(delay / 1000);
      }
    }
  }
  
  throw lastError ?? new Error('Retry failed');
}
