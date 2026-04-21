/**
 * Load Test - PDP Scenario Only
 * 
 * Simplified load test focusing on Product Detail Page (PDP) browsing.
 * Tests average load (200 req/min) and peak load (500 req/min) scenarios.
 * 
 * Usage:
 *   k6 run dist/tests/load.test.js
 *   k6 run --out dashboard dist/tests/load.test.js
 *   k6 run --env SITE=platypus dist/tests/load.test.js
 *   k6 run --env SITE=skechers dist/tests/load.test.js
 */

import { check, group } from 'k6';
import { Options } from 'k6/options';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
// @ts-expect-error - k6 remote module import
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Import framework modules
import { GraphQLClient } from '../lib/graphql-client';
import { createLogger } from '../lib/logger';
import { thinkTime } from '../lib/utils';
import { customThresholds } from '../lib/metrics';

// Import configuration
import { 
  getSiteConfig, 
  getEnvironmentConfig, 
  isDryRun,
  isProduction,
} from '../config';

// Import scenarios
import { pdpScenario } from '../scenarios/pdp';

// Import types
import { TestProduct, SiteConfig } from '../types';

const logger = createLogger('LoadTest');

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

/**
 * k6 Options for Load Test - PDP Only
 * 
 * Stages:
 * 1. Ramp-up: 0 -> 50 VUs over 2 minutes
 * 2. Average load: 50 VUs for 5 minutes (~200 req/min)
 * 3. Ramp to peak: 50 -> 100 VUs over 2 minutes
 * 4. Peak load: 100 VUs for 5 minutes (~500 req/min)
 * 5. Ramp-down: 100 -> 0 VUs over 2 minutes
 */
export const options: Options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp-up
    { duration: '5m', target: 50 },   // Average load
    { duration: '2m', target: 100 },  // Ramp to peak
    { duration: '5m', target: 100 },  // Peak load
    { duration: '2m', target: 0 },    // Ramp-down
  ],
  
  // Performance thresholds
  thresholds: {
    // HTTP metrics
    'http_req_duration': ['p(95)<800', 'p(99)<2000'],
    'http_req_failed': ['rate<0.01'],
    'http_req_waiting': ['p(95)<600'],
    
    // GraphQL metrics
    'graphql_errors': ['rate<0.01'],
    'graphql_request_duration': ['p(95)<800', 'p(99)<2000'],
    
    // Scenario metrics — sourced from customThresholds for consistency
    'scenario_pdp_success': customThresholds['scenario_pdp_success'],
    'scenario_pdp_duration': customThresholds['scenario_pdp_duration'],
  },
  
  // Tags
  tags: {
    testType: 'load',
    scenario: 'pdp',
  },
  
  // Connection settings
  noConnectionReuse: false,
  userAgent: 'k6-load-test-pdp/1.0',
};

// ============================================================================
// TEST DATA
// ============================================================================

/** Products loaded from src/data/products-platypus.json (shared across all VUs) */
const PLATYPUS_PRODUCTS = new SharedArray('platypus-products', function () {
  const raw = JSON.parse(open('../data/products-platypus.json')) as { data: TestProduct[] };
  return raw.data;
});

/** Products loaded from src/data/products-skechers.json (shared across all VUs) */
const SKECHERS_PRODUCTS = new SharedArray('skechers-products', function () {
  const raw = JSON.parse(open('../data/products-skechers.json')) as { data: TestProduct[] };
  return raw.data;
});

/** Sites that have no real product data file yet */
const PLACEHOLDER_PRODUCTS: TestProduct[] = [
  { id: '1', sku: 'PLACEHOLDER-SKU', productType: 'configurable' },
];

/** Map site ID → product list */
const PRODUCTS: Record<string, TestProduct[]> = {
  'platypus-au': PLATYPUS_PRODUCTS as unknown as TestProduct[],
  'platypus-nz': PLATYPUS_PRODUCTS as unknown as TestProduct[],
  'skechers-au':  SKECHERS_PRODUCTS as unknown as TestProduct[],
  'skechers-nz':  SKECHERS_PRODUCTS as unknown as TestProduct[],
  'drmartens-au': PLACEHOLDER_PRODUCTS,
  'drmartens-nz': PLACEHOLDER_PRODUCTS,
  'vans-au':      PLACEHOLDER_PRODUCTS,
  'vans-nz':      PLACEHOLDER_PRODUCTS,
};

/** Sites whose product list still contains placeholder SKUs */
const SITES_WITH_PLACEHOLDERS = new Set(
  Object.entries(PRODUCTS)
    .filter(([, products]) => products.some(p => p.sku === 'PLACEHOLDER-SKU'))
    .map(([siteId]) => siteId)
);

// ============================================================================
// MODULE-LEVEL CLIENT (created once per VU, not per iteration)
// ============================================================================

const _siteConfig = getSiteConfig();
const _client = new GraphQLClient(_siteConfig);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRandomProduct(siteId: string): TestProduct {
  const products = PRODUCTS[siteId] || PRODUCTS['platypus-au'];
  return randomItem(products) as TestProduct;
}

// ============================================================================
// SETUP
// ============================================================================

interface SetupData {
  siteConfig: SiteConfig;
  siteId: string;
}

export function setup(): SetupData {
  logger.info('=== Load Test Setup - PDP Only ===');
  
  const siteConfig = getSiteConfig();
  const envConfig = getEnvironmentConfig();
  
  logger.info(`Site: ${siteConfig.name}`);
  logger.info(`GraphQL Endpoint: ${siteConfig.graphqlEndpoint}`);
  logger.info(`Environment: ${envConfig.environment}`);
  logger.info(`Is Production: ${isProduction()}`);
  logger.info(`Dry Run: ${isDryRun()}`);
  
  // Production safety check
  if (isProduction()) {
    logger.warn('⚠️  Running load test against PRODUCTION');
    logger.warn('⚠️  Ensure this is authorized and monitored');
  }
  
  return {
    siteConfig,
    siteId: siteConfig.id,
  };
}

// ============================================================================
// DEFAULT FUNCTION (MAIN TEST)
// ============================================================================

/**
 * Main test function - PDP browsing scenario
 */
export default function(data: SetupData): void {
  const { siteConfig, siteId } = data;
  const envConfig = getEnvironmentConfig();
  const vuId = exec.vu.idInTest;
  const iteration = exec.vu.iterationInScenario;

  // Guard: skip sites with unresolved placeholder SKUs
  if (SITES_WITH_PLACEHOLDERS.has(siteId)) {
    logger.warn(`⚠️  Site '${siteId}' has PLACEHOLDER-SKU entries — run the product discovery script first`);
    return;
  }

  // Get a random product
  const product = getRandomProduct(siteId);
  
  logger.debug(`VU ${vuId} - Iteration ${iteration} - Loading PDP: ${product.sku}`);
  
  // Execute PDP scenario (reuses module-level client — created once per VU)
  group('PDP Load', () => {
    const { result, product: loadedProduct } = pdpScenario(
      { sku: product.sku },
      _client,
      siteConfig
    );
    
    check(result, {
      'PDP load successful': (r) => r.success,
      'Product data retrieved': () => loadedProduct !== null,
      'Has product SKU': () => loadedProduct?.sku === product.sku,
    });
    
    if (!result.success) {
      logger.error(`PDP load failed for ${product.sku}: ${result.error ?? 'Unknown error'}`);
    }
  });
  
  // Simulate user browsing/reading time
  thinkTime(envConfig);
}

// ============================================================================
// TEARDOWN
// ============================================================================

export function teardown(data: SetupData): void {
  logger.info('=== Load Test Teardown ===');
  logger.info(`Site: ${data.siteConfig.name}`);
  logger.info('Load test completed');
}
