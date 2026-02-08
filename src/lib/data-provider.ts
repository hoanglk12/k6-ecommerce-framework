/**
 * Data Provider Module
 * 
 * Provides data loading and rotation capabilities for test data from CSV and JSON files.
 * Supports different data selection strategies: sequential, random, and unique per VU.
 */

import { SharedArray } from 'k6/data';
// import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';
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

const DATA_PATHS = {
  users: {
    csv: '../data/users.csv',
    json: '../data/users.json',
  },
  products: {
    platypus: {
      csv: '../data/products-platypus.csv',
      json: '../data/products-platypus.json',
    },
    skechers: {
      csv: '../data/products-skechers.csv',
      json: '../data/products-skechers.json',
    },
  },
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
    transformHeader: (header: string) => header.trim().toLowerCase(),
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
      const vuId = exec.vu.idInTest;
      const index = (vuId - 1) % this.data.length;
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

// Lazy-loaded data providers using SharedArray
let _usersData: TestUser[] | null = null;
let _productsDataPlatypus: TestProduct[] | null = null;
let _productsDataSkechers: TestProduct[] | null = null;
let _addressesData: TestAddress[] | null = null;

/**
 * Get user data provider
 * 
 * @param strategy - Data rotation strategy
 */
export function getUserProvider(strategy: DataRotationStrategy = 'sequential'): DataProvider<TestUser> {
  if (!_usersData) {
    try {
      _usersData = loadJSON<TestUser>('users', DATA_PATHS.users.json);
    } catch {
      logger.warn('Failed to load users from JSON, trying CSV');
      _usersData = loadCSV<TestUser>('users', DATA_PATHS.users.csv);
    }
  }
  return new DataProvider<TestUser>(_usersData, strategy);
}

/**
 * Get product data provider for a specific site
 * 
 * @param site - Site identifier ('platypus' or 'skechers')
 * @param strategy - Data rotation strategy
 */
export function getProductProvider(
  site: 'platypus' | 'skechers',
  strategy: DataRotationStrategy = 'random'
): DataProvider<TestProduct> {
  const paths = DATA_PATHS.products[site];
  
  if (site === 'platypus') {
    if (!_productsDataPlatypus) {
      try {
        _productsDataPlatypus = loadJSON<TestProduct>('products-platypus', paths.json);
      } catch {
        logger.warn('Failed to load products from JSON, trying CSV');
        _productsDataPlatypus = loadCSV<TestProduct>('products-platypus', paths.csv);
      }
    }
    return new DataProvider<TestProduct>(_productsDataPlatypus, strategy);
  } else {
    if (!_productsDataSkechers) {
      try {
        _productsDataSkechers = loadJSON<TestProduct>('products-skechers', paths.json);
      } catch {
        logger.warn('Failed to load products from JSON, trying CSV');
        _productsDataSkechers = loadCSV<TestProduct>('products-skechers', paths.csv);
      }
    }
    return new DataProvider<TestProduct>(_productsDataSkechers, strategy);
  }
}

/**
 * Get address data provider
 * 
 * @param strategy - Data rotation strategy
 */
export function getAddressProvider(strategy: DataRotationStrategy = 'random'): DataProvider<TestAddress> {
  if (!_addressesData) {
    try {
      _addressesData = loadJSON<TestAddress>('addresses', DATA_PATHS.addresses.json);
    } catch {
      logger.warn('Failed to load addresses from JSON, trying CSV');
      _addressesData = loadCSV<TestAddress>('addresses', DATA_PATHS.addresses.csv);
    }
  }
  return new DataProvider<TestAddress>(_addressesData, strategy);
}

// ============================================================================
// DATA VALIDATION HELPERS
// ============================================================================

/**
 * Validate test user data
 */
export function validateUser(user: TestUser): boolean {
  return !!(
    user &&
    user.email &&
    user.password &&
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
    product &&
    product.sku &&
    typeof product.sku === 'string' &&
    product.sku.length > 0
  );
}

/**
 * Validate test address data
 */
export function validateAddress(address: TestAddress): boolean {
  return !!(
    address &&
    address.firstname &&
    address.lastname &&
    address.street &&
    Array.isArray(address.street) &&
    address.street.length > 0 &&
    address.city &&
    address.postcode &&
    address.country_code &&
    address.telephone
  );
}
