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
import exec from 'k6/execution';
// @ts-expect-error - k6 remote module import
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Import framework modules
import { GraphQLClient } from '../lib/graphql-client';
import { createLogger } from '../lib/logger';
import { thinkTime } from '../lib/utils';

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
    
    // Scenario metrics
    'scenario_pdp_success': ['rate>0.99'],
    'scenario_pdp_duration': ['p(95)<800'],
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

// ============================================================================
// TEST DATA
// ============================================================================

// Products data - Real SKUs discovered from sites
const PRODUCTS: Record<string, TestProduct[]> = {
  'platypus-au': [
    // All ConfigurableProducts from Platypus AU
    { id: '1', sku: 'ADYS400073-062.BLK', productType: 'configurable' },
    { id: '2', sku: '26422322.PNK', productType: 'configurable' },
    { id: '3', sku: '300660XKSK.BLK', productType: 'configurable' },
    { id: '4', sku: '27875001.BLK', productType: 'configurable' },
    { id: '5', sku: 'ADYS400094XKWR.BLK', productType: 'configurable' },
  ],
  'platypus-nz': [
    // Platypus NZ products (to be discovered)
    { id: '1', sku: 'ADYS400073-062.BLK', productType: 'configurable' },
  ],
  'skechers-au': [
    // Real products discovered from Skechers AU staging site
    { id: '1', sku: '894130.BLK', productType: 'configurable' }, // Work Athletic Composite Toe Safety Shoe
    { id: '2', sku: '136451.NAT', productType: 'configurable' }, // Skechers On-The-Go Flex - Embark
    { id: '3', sku: '136451.NVY', productType: 'configurable' }, // Skechers On-The-Go Flex - Embark
    { id: '4', sku: '76536.BBK', productType: 'configurable' }, // Work Sure Track
    { id: '5', sku: '124806.NVY', productType: 'configurable' }, // Skechers GOwalk Glide-Step Flex
  ],
  'skechers-nz': [
    // Skechers NZ products (to be discovered)
    { id: '1', sku: '114343-101.101', productType: 'configurable' },
  ],
  'drmartens-au': [
    // Dr Martens AU products (to be discovered)
    { id: '1', sku: 'PLACEHOLDER-SKU', productType: 'configurable' },
  ],
  'drmartens-nz': [
    // Dr Martens NZ products (to be discovered)
    { id: '1', sku: 'PLACEHOLDER-SKU', productType: 'configurable' },
  ],
  'vans-au': [
    // Vans AU products (to be discovered)
    { id: '1', sku: 'PLACEHOLDER-SKU', productType: 'configurable' },
  ],
  'vans-nz': [
    // Vans NZ products (to be discovered)
    { id: '1', sku: 'PLACEHOLDER-SKU', productType: 'configurable' },
  ],
};

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
  
  // Get a random product
  const product = getRandomProduct(siteId);
  
  logger.debug(`VU ${vuId} - Iteration ${iteration} - Loading PDP: ${product.sku}`);
  
  // Execute PDP scenario
  group('PDP Load', () => {
    const client = new GraphQLClient(siteConfig);
    
    const { result, product: loadedProduct } = pdpScenario(
      { sku: product.sku },
      client,
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
