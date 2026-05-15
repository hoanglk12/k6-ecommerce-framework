/**
 * Data Provider Module
 * 
 * Provides data loading and rotation capabilities for test data from CSV and JSON files.
 * Supports different data selection strategies: sequential, random, and unique per VU.
 */

import { SharedArray } from 'k6/data';
import papaparse from './vendor/papaparse.js';
import exec from 'k6/execution';
import { 
  TestUser, 
  TestProduct, 
  TestAddress, 
  DataRotationStrategy,
  CSVParserOptions 
} from '../types';
import { createLogger } from '../lib/logger';

const logger = createLogger('DataProvider');

// ============================================================================
// DATA FILE PATHS
// ============================================================================

/** Brand key used to look up product data files. vans-au/nz are site-specific
 *  because their product catalogues differ between countries. */
export type ProductSite = 'platypus' | 'skechers' | 'drmartens' | 'vans-au' | 'vans-nz';

/** Maps the full 8-character site ID to the product data key. */
const SITE_TO_PRODUCT_KEY: Record<string, ProductSite> = {
  'platypus-au':  'platypus',
  'platypus-nz':  'platypus',
  'skechers-au':  'skechers',
  'skechers-nz':  'skechers',
  'drmartens-au': 'drmartens',
  'drmartens-nz': 'drmartens',
  'vans-au':      'vans-au',
  'vans-nz':      'vans-nz',
};

const DATA_PATHS = {
  users: {
    csv: '../data/users.csv',
    json: '../data/users.json',
  },
  products: {
    platypus:  { json: '../data/products-platypus.json', csv: '../data/products-platypus.csv' },
    skechers:  { json: '../data/products-skechers.json', csv: '../data/products-skechers.csv' },
    drmartens: { json: '../data/products-drmartens.json' },
    'vans-au': { json: '../data/products-vans-au.json' },
    'vans-nz': { json: '../data/products-vans-nz.json' },
  } as Record<ProductSite, { json: string; csv?: string }>,
  addresses: {
    csv: '../data/addresses.csv',
    json: '../data/addresses.json',
  },
};

// ============================================================================
// CSV PARSER
// ============================================================================

/**
 * Parse CSV content into array of objects
 * 
 * @param csvContent - Raw CSV string content
 * @param options - Parser options
 * @returns Array of parsed objects
 */
export function parseCSV<T>(csvContent: string, options: CSVParserOptions = {}): T[] {
  const config = {
    header: options.hasHeader ?? true,
    delimiter: options.delimiter ?? ',',
    skipEmptyLines: options.skipEmpty ?? true,
    transformHeader: (header: string): string => header.trim().toLowerCase(),
  };

  const result = papaparse.parse(csvContent, config);

  if (result.errors && result.errors.length > 0) {
    logger.warn('CSV parse warnings', { errors: result.errors });
  }

  return result.data as T[];
}

/**
 * Load and parse a CSV file using SharedArray for memory efficiency
 * 
 * @param name - Unique name for the SharedArray
 * @param filePath - Path to the CSV file
 * @param options - Parser options
 * @returns SharedArray of parsed objects
 */
export function loadCSV<T>(
  name: string,
  filePath: string,
  options: CSVParserOptions = {}
): T[] {
  return new SharedArray(name, function () {
    const content = open(filePath);
    return parseCSV<T>(content, options);
  });
}

// ============================================================================
// JSON LOADER
// ============================================================================

/**
 * Load and parse a JSON file using SharedArray for memory efficiency
 * 
 * @param name - Unique name for the SharedArray
 * @param filePath - Path to the JSON file
 * @returns SharedArray of parsed objects
 */
export function loadJSON<T>(name: string, filePath: string): T[] {
  return new SharedArray(name, function () {
    const content = open(filePath);
    const data = JSON.parse(content);
    
    // Handle both array and object with 'data' property
    if (Array.isArray(data)) {
      return data;
    }
    
    if (data && Array.isArray(data.data)) {
      return data.data;
    }
    
    logger.warn('JSON file does not contain an array', { filePath });
    return [];
  });
}

// ============================================================================
// DATA PROVIDER CLASS
// ============================================================================

/**
 * Generic Data Provider for test data management
 */
export class DataProvider<T> {
  private readonly data: T[];
  private readonly strategy: DataRotationStrategy;
  private currentIndex: number = 0;
  private usedIndices: Set<number> = new Set();

  constructor(data: T[], strategy: DataRotationStrategy = 'sequential') {
    this.data = data;
    this.strategy = strategy;
    
    if (this.data.length === 0) {
      logger.warn('DataProvider initialized with empty data array');
    }
  }

  /**
   * Get the next item based on rotation strategy
   */
  getNext(): T {
    if (this.data.length === 0) {
      throw new Error('No data available in DataProvider');
    }

    switch (this.strategy) {
      case 'random':
        return this.getRandomItem();
      case 'unique':
        return this.getUniqueItem();
      case 'sequential':
      default:
        return this.getSequentialItem();
    }
  }

  /**
   * Get item by VU ID (for consistent data per VU)
   */
  getByVU(): T {
    if (this.data.length === 0) {
      throw new Error('No data available in DataProvider');
    }

    try {
      const index = exec.scenario.iterationInTest % this.data.length;
      return this.data[index];
    } catch {
      // Fallback to sequential if VU context not available
      return this.getSequentialItem();
    }
  }

  /**
   * Get item by index
   */
  getByIndex(index: number): T {
    if (index < 0 || index >= this.data.length) {
      throw new Error(`Index ${index} out of bounds (0-${this.data.length - 1})`);
    }
    return this.data[index];
  }

  /**
   * Get all data items
   */
  getAll(): T[] {
    return [...this.data];
  }

  /**
   * Get total count of items
   */
  count(): number {
    return this.data.length;
  }

  /**
   * Filter data by predicate
   */
  filter(predicate: (item: T) => boolean): T[] {
    return this.data.filter(predicate);
  }

  /**
   * Find first item matching predicate
   */
  find(predicate: (item: T) => boolean): T | undefined {
    return this.data.find(predicate);
  }

  /**
   * Reset the provider state
   */
  reset(): void {
    this.currentIndex = 0;
    this.usedIndices.clear();
  }

  // Private helper methods

  private getSequentialItem(): T {
    const item = this.data[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.data.length;
    return item;
  }

  private getRandomItem(): T {
    const index = Math.floor(Math.random() * this.data.length);
    return this.data[index];
  }

  private getUniqueItem(): T {
    // If all items used, reset
    if (this.usedIndices.size >= this.data.length) {
      this.usedIndices.clear();
    }

    let index: number;
    do {
      index = Math.floor(Math.random() * this.data.length);
    } while (this.usedIndices.has(index));

    this.usedIndices.add(index);
    return this.data[index];
  }
}

// ============================================================================
// SPECIALIZED DATA PROVIDERS
// ============================================================================

// Lazy-loaded SharedArray data — one entry per product key, shared across VUs
const _productCache: Partial<Record<ProductSite, TestProduct[]>> = {};
let _usersData: TestUser[] | null = null;
let _addressesData: TestAddress[] | null = null;

// Provider-instance cache — keyed by strategy so callers always get the same
// DataProvider object regardless of how many times the factory is invoked.
// This preserves sequential currentIndex and unique usedIndices across calls.
const _userProviders: Partial<Record<DataRotationStrategy, DataProvider<TestUser>>> = {};
const _addressProviders: Partial<Record<DataRotationStrategy, DataProvider<TestAddress>>> = {};

function loadProductData(key: ProductSite): TestProduct[] {
  if (!_productCache[key]) {
    const paths = DATA_PATHS.products[key];
    try {
      _productCache[key] = loadJSON<TestProduct>(`products-${key}`, paths.json);
    } catch {
      if (paths.csv) {
        logger.warn(`Failed to load ${key} products from JSON, trying CSV`);
        _productCache[key] = loadCSV<TestProduct>(`products-${key}`, paths.csv);
      } else {
        throw new Error(`Failed to load product data for '${key}'`);
      }
    }
  }
  const data = _productCache[key];
  if (!data) throw new Error(`Product data for '${key}' unexpectedly missing after load`);
  return data;
}

/**
 * Get user data provider.
 * Returns the same DataProvider instance for a given strategy so that
 * sequential currentIndex and unique usedIndices are preserved across calls.
 */
export function getUserProvider(strategy: DataRotationStrategy = 'sequential'): DataProvider<TestUser> {
  if (_userProviders[strategy]) return _userProviders[strategy]!;
  if (!_usersData) {
    try {
      _usersData = loadJSON<TestUser>('users', DATA_PATHS.users.json);
    } catch {
      logger.warn('Failed to load users from JSON, trying CSV');
      _usersData = loadCSV<TestUser>('users', DATA_PATHS.users.csv);
    }
  }
  _userProviders[strategy] = new DataProvider<TestUser>(_usersData, strategy);
  return _userProviders[strategy]!;
}

/**
 * Get product data provider by product-site key.
 * For convenience from test files, prefer getProductProviderForSite().
 */
export function getProductProvider(
  site: ProductSite,
  strategy: DataRotationStrategy = 'random'
): DataProvider<TestProduct> {
  return new DataProvider<TestProduct>(loadProductData(site), strategy);
}

/**
 * Get product data provider using the full 8-site ID (e.g. 'platypus-au', 'vans-nz').
 * Throws if siteId is not in the supported set.
 */
export function getProductProviderForSite(
  siteId: string,
  strategy: DataRotationStrategy = 'random'
): DataProvider<TestProduct> {
  const key = SITE_TO_PRODUCT_KEY[siteId];
  if (!key) {
    const valid = Object.keys(SITE_TO_PRODUCT_KEY).join(', ');
    throw new Error(`No product data configured for site '${siteId}'. Valid: ${valid}`);
  }
  return getProductProvider(key, strategy);
}

/**
 * Get address data provider.
 * Returns the same DataProvider instance for a given strategy so that
 * sequential currentIndex and unique usedIndices are preserved across calls.
 */
export function getAddressProvider(strategy: DataRotationStrategy = 'random'): DataProvider<TestAddress> {
  if (_addressProviders[strategy]) return _addressProviders[strategy]!;
  if (!_addressesData) {
    try {
      _addressesData = loadJSON<TestAddress>('addresses', DATA_PATHS.addresses.json);
    } catch {
      logger.warn('Failed to load addresses from JSON, trying CSV');
      _addressesData = loadCSV<TestAddress>('addresses', DATA_PATHS.addresses.csv);
    }
  }
  _addressProviders[strategy] = new DataProvider<TestAddress>(_addressesData, strategy);
  return _addressProviders[strategy]!;
}

// ============================================================================
// DATA VALIDATION HELPERS
// ============================================================================

/**
 * Validate test user data
 */
export function validateUser(user: TestUser): boolean {
  return !!(
    user?.email &&
    user?.password &&
    typeof user.email === 'string' &&
    typeof user.password === 'string' &&
    user.email.includes('@')
  );
}

/**
 * Validate test product data
 */
export function validateProduct(product: TestProduct): boolean {
  return !!(
    product?.sku &&
    typeof product.sku === 'string' &&
    product.sku.length > 0
  );
}

/**
 * Validate test address data
 */
export function validateAddress(address: TestAddress): boolean {
  return !!(
    address?.firstname &&
    address?.lastname &&
    address?.street &&
    Array.isArray(address.street) &&
    address.street.length > 0 &&
    address?.city &&
    address?.postcode &&
    address?.country_code &&
    address?.telephone
  );
}
