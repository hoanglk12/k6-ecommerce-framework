/**
 * Load Test - PLP (Product Listing Page) Scenario
 * 
 * Tests category/product listing page load across all 8 sites
 * (PLA, SKX, DRM, VAN × AU, NZ) on staging environment.
 * 
 * Each VU browses unique category pages to avoid cache bias.
 * Even 404 / empty categories are counted as viewed pages.
 * 
 * Usage:
 *   k6 run dist/tests/plp-load.test.js
 *   k6 run --env SITE=platypus-au dist/tests/plp-load.test.js
 *   k6 run --env SITE=skechers-au dist/tests/plp-load.test.js
 *   k6 run --env SITE=drmartens-au dist/tests/plp-load.test.js
 *   k6 run --env SITE=vans-nz dist/tests/plp-load.test.js
 *   k6 run --out dashboard dist/tests/plp-load.test.js
 */

import { check, group } from 'k6';
import { Options } from 'k6/options';
import exec from 'k6/execution';

// Framework modules
import { GraphQLClient } from '../lib/graphql-client';
import { createLogger } from '../lib/logger';
import { thinkTime } from '../lib/utils';
import { customThresholds } from '../lib/metrics';

// Configuration
import {
  getSiteConfig,
  getEnvironmentConfig,
  isDryRun,
  isProduction,
} from '../config';

// Scenario
import { plpScenario } from '../scenarios/plp';

// Types
import { TestCategory, SiteConfig } from '../types';

const logger = createLogger('PLPLoadTest');

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

/**
 * k6 Options for PLP Load Test
 * 
 * Stages:
 * 1. Ramp-up: 0 → 50 VUs over 2 min
 * 2. Average load: 50 VUs for 5 min  (~200 req/min)
 * 3. Ramp to peak: 50 → 100 VUs over 2 min
 * 4. Peak load: 100 VUs for 5 min    (~500 req/min)
 * 5. Ramp-down: 100 → 0 VUs over 2 min
 */
export const options: Options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],

  thresholds: {
    // HTTP metrics
    'http_req_duration': ['p(95)<800', 'p(99)<2000'],
    'http_req_failed': ['rate<0.01'],
    'http_req_waiting': ['p(95)<600'],

    // GraphQL metrics
    'graphql_errors': ['rate<0.01'],
    'graphql_request_duration': ['p(95)<800', 'p(99)<2000'],

    // PLP-specific metrics — sourced from customThresholds for consistency
    'scenario_plp_success': customThresholds['scenario_plp_success'],
    'scenario_plp_duration': customThresholds['scenario_plp_duration'],
    'plp_category_query_time': ['p(95)<1500'],
    'plp_products_query_time': ['p(95)<2000'],
    'plp_category_found': ['rate>0.80'],
  },

  tags: {
    testType: 'load',
    scenario: 'plp',
  },

  noConnectionReuse: false,
  userAgent: 'k6-load-test-plp/1.0',
};

// ============================================================================
// TEST DATA - CATEGORY PATHS PER SITE
// ============================================================================

/**
 * Category URL paths for each site.
 * Each VU picks categories uniquely using its VU id + iteration index
 * so that every request hits a different category page.
 */
const CATEGORIES: Record<string, TestCategory[]> = {
  // ── Platypus AU ──────────────────────────────────────────────────────
  'platypus-au': [
    { id: 'cat-001', urlPath: 'mens', name: 'Mens' },
    { id: 'cat-002', urlPath: 'womens', name: 'Womens' },
    { id: 'cat-003', urlPath: 'kids', name: 'Kids' },
    { id: 'cat-004', urlPath: 'sale', name: 'Sale' },
    { id: 'cat-005', urlPath: 'mens/footwear', name: 'Mens Footwear' },
    { id: 'cat-006', urlPath: 'womens/footwear', name: 'Womens Footwear' },
    { id: 'cat-007', urlPath: 'mens/clothing', name: 'Mens Clothing' },
    { id: 'cat-008', urlPath: 'womens/clothing', name: 'Womens Clothing' },
    { id: 'cat-009', urlPath: 'mens/accessories', name: 'Mens Accessories' },
    { id: 'cat-010', urlPath: 'womens/accessories', name: 'Womens Accessories' },
    { id: 'cat-011', urlPath: 'vans', name: 'Vans' },
    { id: 'cat-012', urlPath: 'adidas', name: 'Adidas' },
    { id: 'cat-013', urlPath: 'converse', name: 'Converse' },
    { id: 'cat-014', urlPath: 'nike', name: 'Nike' },
    { id: 'cat-015', urlPath: 'new-balance', name: 'New Balance' },
    { id: 'cat-016', urlPath: 'puma', name: 'Puma' },
    { id: 'cat-017', urlPath: 'kids/girls', name: 'Kids Girls' },
    { id: 'cat-018', urlPath: 'kids/boys', name: 'Kids Boys' },
    { id: 'cat-019', urlPath: 'sale/footwear', name: 'Sale Footwear' },
    { id: 'cat-020', urlPath: 'sale/accessories', name: 'Sale Accessories' },
  ],
  // ── Platypus NZ ──────────────────────────────────────────────────────
  'platypus-nz': [
    { id: 'cat-001', urlPath: 'mens', name: 'Mens' },
    { id: 'cat-002', urlPath: 'womens', name: 'Womens' },
    { id: 'cat-003', urlPath: 'kids', name: 'Kids' },
    { id: 'cat-004', urlPath: 'sale', name: 'Sale' },
    { id: 'cat-005', urlPath: 'mens/footwear', name: 'Mens Footwear' },
    { id: 'cat-006', urlPath: 'womens/footwear', name: 'Womens Footwear' },
    { id: 'cat-007', urlPath: 'mens/clothing', name: 'Mens Clothing' },
    { id: 'cat-008', urlPath: 'womens/clothing', name: 'Womens Clothing' },
    { id: 'cat-009', urlPath: 'mens/accessories', name: 'Mens Accessories' },
    { id: 'cat-010', urlPath: 'womens/accessories', name: 'Womens Accessories' },
    { id: 'cat-011', urlPath: 'mens/vans', name: 'Mens Vans' },
    { id: 'cat-012', urlPath: 'womens/vans', name: 'Womens Vans' },
    { id: 'cat-013', urlPath: 'womens/converse', name: 'Womens Converse' },
    { id: 'cat-014', urlPath: 'womens/nike', name: 'Womens Nike' },
    { id: 'cat-015', urlPath: 'mens/new-balance', name: 'Mens New Balance' },
    { id: 'cat-016', urlPath: 'womens/puma', name: 'Womens Puma' },
    { id: 'cat-017', urlPath: 'kids/girls', name: 'Kids Girls' },
    { id: 'cat-018', urlPath: 'kids/boys', name: 'Kids Boys' },
    { id: 'cat-019', urlPath: 'sale/footwear', name: 'Sale Footwear' },
    { id: 'cat-020', urlPath: 'sale/accessories', name: 'Sale Accessories' },
  ],
  // ── Skechers AU ──────────────────────────────────────────────────────
  'skechers-au': [
    { id: 'cat-001', urlPath: 'women', name: 'Women' },
    { id: 'cat-002', urlPath: 'men', name: 'Men' },
    { id: 'cat-003', urlPath: 'kids', name: 'Kids' },
    { id: 'cat-004', urlPath: 'sale', name: 'Sale' },
    { id: 'cat-005', urlPath: 'women/footwear', name: 'Women Footwear' },
    { id: 'cat-006', urlPath: 'men/footwear', name: 'Men Footwear' },
    { id: 'cat-007', urlPath: 'women/walking', name: 'Women Walking' },
    { id: 'cat-008', urlPath: 'men/walking', name: 'Men Walking' },
    { id: 'cat-009', urlPath: 'women/gowalk', name: 'Women GOwalk' },
    { id: 'cat-010', urlPath: 'men/gowalk', name: 'Men GO Walk' },
    { id: 'cat-011', urlPath: 'women/sport', name: 'Women Sport' },
    { id: 'cat-012', urlPath: 'men/sport', name: 'Men Sport' },
    { id: 'cat-013', urlPath: 'women/skech-air', name: 'Women Skech Air' },
    { id: 'cat-014', urlPath: 'men/skech-air', name: 'Men Skech Air' },
    { id: 'cat-015', urlPath: 'women/skechers-street', name: 'Women Skechers Street' },
    { id: 'cat-016', urlPath: 'women/arch-fit', name: 'Women Arch Fit' },
    { id: 'cat-017', urlPath: 'women/stretch-fit', name: 'Women Stretch Fit' },
    { id: 'cat-018', urlPath: 'women/uno', name: 'Women Uno' },
    { id: 'cat-019', urlPath: 'men/uno', name: 'Men Uno' },
    { id: 'cat-020', urlPath: 'sale/last-pairs', name: 'Sale Last Pairs' },
  ],
  // ── Skechers NZ ──────────────────────────────────────────────────────
  'skechers-nz': [
    { id: 'cat-001', urlPath: 'women', name: 'Women' },
    { id: 'cat-002', urlPath: 'men', name: 'Men' },
    { id: 'cat-003', urlPath: 'kids', name: 'Kids' },
    { id: 'cat-004', urlPath: 'sale', name: 'Sale' },
    { id: 'cat-005', urlPath: 'women/footwear', name: 'Women Footwear' },
    { id: 'cat-006', urlPath: 'men/footwear', name: 'Men Footwear' },
    { id: 'cat-007', urlPath: 'women/walking', name: 'Women Walking' },
    { id: 'cat-008', urlPath: 'men/walking', name: 'Men Walking' },
    { id: 'cat-009', urlPath: 'women/gowalk', name: 'Women GOwalk' },
    { id: 'cat-010', urlPath: 'men/gowalk', name: 'Men GO Walk' },
    { id: 'cat-011', urlPath: 'women/sport', name: 'Women Sport' },
    { id: 'cat-012', urlPath: 'men/sport', name: 'Men Sport' },
    { id: 'cat-013', urlPath: 'women/skech-air', name: 'Women Skech Air' },
    { id: 'cat-014', urlPath: 'men/skech-air', name: 'Men Skech Air' },
    { id: 'cat-015', urlPath: 'women/skechers-street', name: 'Women Skechers Street' },
    { id: 'cat-016', urlPath: 'women/arch-fit', name: 'Women Arch Fit' },
    { id: 'cat-017', urlPath: 'women/stretch-fit', name: 'Women Stretch Fit' },
    { id: 'cat-018', urlPath: 'kids/light-ups', name: 'Kids Light-Ups' },
    { id: 'cat-019', urlPath: 'sale/womens', name: 'Sale Womens' },
    { id: 'cat-020', urlPath: 'sale/mens', name: 'Sale Mens' },
  ],
  // ── Dr Martens AU ────────────────────────────────────────────────────
  'drmartens-au': [
    { id: 'cat-001', urlPath: 'unisex', name: 'For All' },
    { id: 'cat-002', urlPath: 'women', name: 'Women' },
    { id: 'cat-003', urlPath: 'men', name: 'Men' },
    { id: 'cat-004', urlPath: 'kids', name: 'Kids' },
    { id: 'cat-005', urlPath: 'sale', name: 'Sale' },
    { id: 'cat-006', urlPath: 'unisex/footwear', name: 'Unisex Footwear' },
    { id: 'cat-007', urlPath: 'women/footwear', name: 'Women Footwear' },
    { id: 'cat-008', urlPath: 'men/footwear', name: 'Men Footwear' },
    { id: 'cat-009', urlPath: 'unisex/originals', name: 'Unisex Originals' },
    { id: 'cat-010', urlPath: 'women/originals', name: 'Women Originals' },
    { id: 'cat-011', urlPath: 'men/originals', name: 'Men Originals' },
    { id: 'cat-012', urlPath: 'unisex/accessories', name: 'Unisex Accessories' },
    { id: 'cat-013', urlPath: 'women/accessories', name: 'Women Accessories' },
    { id: 'cat-014', urlPath: 'men/accessories', name: 'Men Accessories' },
    { id: 'cat-015', urlPath: 'unisex/best-sellers', name: 'Unisex Best Sellers' },
    { id: 'cat-016', urlPath: 'women/best-sellers', name: 'Women Best Sellers' },
    { id: 'cat-017', urlPath: 'men/best-sellers', name: 'Men Best Sellers' },
    { id: 'cat-018', urlPath: 'kids/footwear', name: 'Kids Footwear' },
    { id: 'cat-019', urlPath: 'sale/footwear', name: 'Sale Footwear' },
    { id: 'cat-020', urlPath: 'sale/accessories', name: 'Sale Accessories' },
  ],
  // ── Dr Martens NZ ────────────────────────────────────────────────────
  'drmartens-nz': [
    { id: 'cat-001', urlPath: 'unisex', name: 'For All' },
    { id: 'cat-002', urlPath: 'women', name: 'Women' },
    { id: 'cat-003', urlPath: 'men', name: 'Men' },
    { id: 'cat-004', urlPath: 'kids', name: 'Kids' },
    { id: 'cat-005', urlPath: 'sale', name: 'Sale' },
    { id: 'cat-006', urlPath: 'unisex/footwear', name: 'Unisex Footwear' },
    { id: 'cat-007', urlPath: 'women/footwear', name: 'Women Footwear' },
    { id: 'cat-008', urlPath: 'men/footwear', name: 'Men Footwear' },
    { id: 'cat-009', urlPath: 'unisex/originals', name: 'Unisex Originals' },
    { id: 'cat-010', urlPath: 'women/originals', name: 'Women Originals' },
    { id: 'cat-011', urlPath: 'men/originals', name: 'Men Originals' },
    { id: 'cat-012', urlPath: 'unisex/accessories', name: 'Unisex Accessories' },
    { id: 'cat-013', urlPath: 'women/accessories', name: 'Women Accessories' },
    { id: 'cat-014', urlPath: 'men/accessories', name: 'Men Accessories' },
    { id: 'cat-015', urlPath: 'unisex/best-sellers', name: 'Unisex Best Sellers' },
    { id: 'cat-016', urlPath: 'women/best-sellers', name: 'Women Best Sellers' },
    { id: 'cat-017', urlPath: 'men/best-sellers', name: 'Men Best Sellers' },
    { id: 'cat-018', urlPath: 'kids/footwear', name: 'Kids Footwear' },
    { id: 'cat-019', urlPath: 'sale/footwear', name: 'Sale Footwear' },
    { id: 'cat-020', urlPath: 'sale/accessories', name: 'Sale Accessories' },
  ],
  // ── Vans AU ──────────────────────────────────────────────────────────
  'vans-au': [
    { id: 'cat-001', urlPath: 'mens', name: 'Mens' },
    { id: 'cat-002', urlPath: 'womens', name: 'Womens' },
    { id: 'cat-003', urlPath: 'kids', name: 'Kids' },
    { id: 'cat-004', urlPath: 'sale', name: 'Sale' },
    { id: 'cat-005', urlPath: 'mens/shoes', name: 'Mens Shoes' },
    { id: 'cat-006', urlPath: 'womens/shoes', name: 'Womens Shoes' },
    { id: 'cat-007', urlPath: 'mens/new-arrivals', name: 'Mens New Arrivals' },
    { id: 'cat-008', urlPath: 'womens/new-arrivals', name: 'Womens New Arrivals' },
    { id: 'cat-009', urlPath: 'mens/classics', name: 'Mens Classics' },
    { id: 'cat-010', urlPath: 'womens/classics', name: 'Womens Classics' },
    { id: 'cat-011', urlPath: 'mens/best-sellers', name: 'Mens Best Sellers' },
    { id: 'cat-012', urlPath: 'womens/best-sellers', name: 'Womens Best Sellers' },
    { id: 'cat-013', urlPath: 'mens/accessories', name: 'Mens Accessories' },
    { id: 'cat-014', urlPath: 'mens/clothing', name: 'Mens Clothing' },
    { id: 'cat-015', urlPath: 'mens/skateboarding', name: 'Mens Skateboarding' },
    { id: 'cat-016', urlPath: 'womens/skateboarding', name: 'Womens Skateboarding' },
    { id: 'cat-017', urlPath: 'kids/shoes', name: 'Kids Shoes' },
    { id: 'cat-018', urlPath: 'kids/easy-on-easy-off', name: 'Kids Easy On Easy Off' },
    { id: 'cat-019', urlPath: 'sale/mens', name: 'Sale Mens' },
    { id: 'cat-020', urlPath: 'sale/womens', name: 'Sale Womens' },
  ],
// ── Vans NZ ──────────────────────────────────────────────────────────
  'vans-nz': [
    { id: 'cat-001', urlPath: 'mens', name: 'Mens' },
    { id: 'cat-002', urlPath: 'womens', name: 'Womens' },
    { id: 'cat-003', urlPath: 'kids', name: 'Kids' },
    { id: 'cat-004', urlPath: 'sale', name: 'Sale' },
    { id: 'cat-005', urlPath: 'mens/shoes', name: 'Mens Shoes' },
    { id: 'cat-006', urlPath: 'womens/shoes', name: 'Womens Shoes' },
    { id: 'cat-007', urlPath: 'mens/new-arrivals', name: 'Mens New Arrivals' },
    { id: 'cat-008', urlPath: 'womens/new-arrivals', name: 'Womens New Arrivals' },
    { id: 'cat-009', urlPath: 'mens/classics', name: 'Mens Classics' },
    { id: 'cat-010', urlPath: 'womens/classics', name: 'Womens Classics' },
    { id: 'cat-011', urlPath: 'mens/best-sellers', name: 'Mens Best Sellers' },
    { id: 'cat-012', urlPath: 'womens/best-sellers', name: 'Womens Best Sellers' },
    { id: 'cat-013', urlPath: 'mens/accessories', name: 'Mens Accessories' },
    { id: 'cat-014', urlPath: 'mens/clothing', name: 'Mens Clothing' },
    { id: 'cat-015', urlPath: 'mens/skateboarding', name: 'Mens Skateboarding' },
    { id: 'cat-016', urlPath: 'womens/skateboarding', name: 'Womens Skateboarding' },
    { id: 'cat-017', urlPath: 'kids/shoes', name: 'Kids Shoes' },
    { id: 'cat-018', urlPath: 'kids/easy-on-easy-off', name: 'Kids Easy On Easy Off' },
    { id: 'cat-019', urlPath: 'sale/mens', name: 'Sale Mens' },
    { id: 'cat-020', urlPath: 'sale/womens', name: 'Sale Womens' },
  ],
};

// ============================================================================
// MODULE-LEVEL CLIENT (created once per VU, not per iteration)
// ============================================================================

const _siteConfig = getSiteConfig();
const _client = new GraphQLClient(_siteConfig);

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get a unique category for the current VU + iteration.
 * Uses (vuId * prime + iteration) % count to spread VUs across categories
 * so that every request within a VU targets a different category.
 */
function getUniqueCategory(siteId: string): TestCategory {
  const categories = CATEGORIES[siteId] || CATEGORIES['platypus-au'];
  const vuId = exec.vu.idInTest;
  const iteration = exec.vu.iterationInScenario;

  // Large prime to scatter VU starting positions and avoid overlap
  const index = (vuId * 7 + iteration) % categories.length;
  return categories[index];
}

// ============================================================================
// SETUP
// ============================================================================

interface SetupData {
  siteConfig: SiteConfig;
  siteId: string;
}

export function setup(): SetupData {
  logger.info('=== PLP Load Test Setup ===');

  const siteConfig = getSiteConfig();
  const envConfig = getEnvironmentConfig();

  logger.info(`Site: ${siteConfig.name}`);
  logger.info(`GraphQL Endpoint: ${siteConfig.graphqlEndpoint}`);
  logger.info(`Environment: ${envConfig.environment}`);
  logger.info(`Is Production: ${isProduction()}`);
  logger.info(`Dry Run: ${isDryRun()}`);

  const siteCats = CATEGORIES[siteConfig.id];
  logger.info(`Categories loaded: ${siteCats ? siteCats.length : 0}`);

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
 * Main test function — PLP browsing scenario
 * 
 * Each VU picks a unique category per iteration to ensure:
 *   - no two consecutive iterations hit the same category
 *   - VUs are spread across different categories
 *   - even 404 / empty categories are recorded (no early exit)
 */
export default function (data: SetupData): void {
  const { siteConfig, siteId } = data;
  const envConfig = getEnvironmentConfig();
  const vuId = exec.vu.idInTest;
  const iteration = exec.vu.iterationInScenario;
  
  // Pick a unique category for this VU + iteration
  const category = getUniqueCategory(siteId);

  logger.debug(`VU ${vuId} - Iteration ${iteration} - Loading PLP: ${category.urlPath}`);

  group('PLP Load', () => {
    // Reuses module-level client — created once per VU, not per iteration
    const { result, category: resolvedCategory, productCount } = plpScenario(
      { urlPath: category.urlPath, name: category.name },
      _client,
      siteConfig
    );

    check(result, {
      'PLP load completed': (r) => r.success,
      'Category was found': () => resolvedCategory !== null,
      'Products returned': () => productCount > 0,
    });

    if (!result.success) {
      logger.warn(
        `PLP load issue for ${category.urlPath}: ${result.error ?? 'Unknown error'}` +
        ` (VU ${vuId}, iter ${iteration})`
      );
    }
  });

  // Simulate user browsing / scrolling through listing
  thinkTime(envConfig);
}

// ============================================================================
// TEARDOWN
// ============================================================================

export function teardown(data: SetupData): void {
  logger.info('=== PLP Load Test Teardown ===');
  logger.info(`Site: ${data.siteConfig.name}`);
  logger.info('PLP load test completed');
}
