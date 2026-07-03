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
 *   k6 run src/tests/plp-load.test.ts
 *   k6 run --env SITE=platypus-au src/tests/plp-load.test.ts
 *   k6 run --env SITE=skechers-au src/tests/plp-load.test.ts
 *   k6 run --env SITE=drmartens-au src/tests/plp-load.test.ts
 *   k6 run --env SITE=vans-nz src/tests/plp-load.test.ts
 *   k6 run --out dashboard src/tests/plp-load.test.ts
 */

import { check, group } from 'k6';
import { Options } from 'k6/options';
import exec from 'k6/execution';

// Framework modules
import { GraphQLClient } from '../lib/graphql-client.ts';
import { createLogger } from '../lib/logger.ts';
import { thinkTime } from '../lib/utils.ts';
import { customThresholds } from '../lib/metrics.ts';
import { getCategoryProvider } from '../lib/data-provider.ts';

// Configuration
import {
  getSiteConfig,
  getEnvironmentConfig,
  isDryRun,
  isProduction,
} from '../config/index.ts';

// Scenario
import { plpScenario } from '../scenarios/plp.ts';

// Types
import { SiteConfig } from '../types/index.ts';

const logger = createLogger('PLPLoadTest');

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

/**
 * k6 Options for PLP Load Test
 *
 * Uses ramping-arrival-rate to guarantee target throughput regardless of
 * response time. With ramping-vus, RPS silently drops when the system gets
 * slow — arrival-rate keeps the load constant so latency degradation is
 * visible in metrics rather than hidden behind VU starvation.
 */
const isSmokeTest = __ENV.SMOKE_TEST === 'true';

export const options: Options = {
  scenarios: isSmokeTest ? {
    // 1 VU × 1 iteration — real API call, all assertions enabled, no think time.
    // Use in CI as a smoke gate before committing to the full 16-minute run.
    plp_smoke: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '30s',
    },
  } : {
    plp_load: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 50,
      maxVUs: 100,
      stages: [
        { duration: '2m', target: 200 },  // ramp to 200 req/min
        { duration: '5m', target: 200 },  // average load
        { duration: '2m', target: 500 },  // ramp to peak
        { duration: '5m', target: 500 },  // peak load
        { duration: '2m', target: 0 },    // ramp-down
      ],
    },
  },

  thresholds: {
    // Error and success rates apply under all executors — a smoke failure here is a real failure
    'http_req_failed': [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
    'graphql_errors': [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
    'scenario_plp_success': customThresholds['scenario_plp_success'],
    'plp_category_found': ['rate>0.80'],

    // Latency thresholds are meaningless for a single cold request — skip during smoke runs
    ...(isSmokeTest ? {} : {
      'http_req_duration': ['p(95)<800', 'p(99)<2000'],
      'http_req_waiting': ['p(95)<600'],
      'graphql_request_duration': ['p(95)<800', 'p(99)<2000'],
      'scenario_plp_duration': customThresholds['scenario_plp_duration'],
      'plp_category_query_time': ['p(95)<1500'],
      'plp_products_query_time': ['p(95)<2000'],
    }),
  },

  tags: {
    testType: 'load',
    scenario: 'plp',
  },

  noConnectionReuse: false,
  userAgent: 'k6-load-test-plp/1.0',
};

// ============================================================================
// MODULE-LEVEL CLIENT + DATA (created once per VU, not per iteration)
// ============================================================================

const _siteConfig = getSiteConfig();
const _client = new GraphQLClient(_siteConfig);
const _categoryProvider = getCategoryProvider(_siteConfig.id);

// ============================================================================
// SETUP
// ============================================================================

interface SetupData {
  siteConfig: SiteConfig;
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

  logger.info(`Categories loaded: ${_categoryProvider.count()}`);

  if (isProduction()) {
    logger.warn('⚠️  Running load test against PRODUCTION');
    logger.warn('⚠️  Ensure this is authorized and monitored');
  }

  return { siteConfig };
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
  const { siteConfig } = data;
  const envConfig = getEnvironmentConfig();
  const vuId = exec.vu.idInTest;
  const iteration = exec.vu.iterationInScenario;

  const category = _categoryProvider.getByVU();

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

  if (!isSmokeTest) thinkTime(envConfig);
}

// ============================================================================
// TEARDOWN
// ============================================================================

export function teardown(data: SetupData): void {
  logger.info('=== PLP Load Test Teardown ===');
  logger.info(`Site: ${data.siteConfig.name}`);
  logger.info('PLP load test completed');
}
