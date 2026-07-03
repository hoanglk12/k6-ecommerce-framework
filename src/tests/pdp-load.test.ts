/**
 * Load Test - PDP Scenario Only
 *
 * Validates average load (200 req/min) and peak load (500 req/min) against the
 * Product Detail Page GraphQL query using a guaranteed arrival-rate executor.
 *
 * Usage:
 *   k6 run src/tests/pdp-load.test.ts
 *   k6 run --out dashboard src/tests/pdp-load.test.ts
 *   k6 run --env SITE=platypus-au src/tests/pdp-load.test.ts
 *   k6 run --env SITE=skechers-au src/tests/pdp-load.test.ts
 */

import { check, fail, group } from 'k6';
import { Options } from 'k6/options';
import exec from 'k6/execution';

// Import framework modules
import { GraphQLClient } from '../lib/graphql-client.ts';
import { createLogger } from '../lib/logger.ts';
import { thinkTime } from '../lib/utils.ts';
import { customThresholds } from '../lib/metrics.ts';
import { getProductProviderForSite, DataProvider } from '../lib/data-provider.ts';

// Import configuration
import {
  getSiteConfig,
  getEnvironmentConfig,
  isDryRun,
  isProduction,
} from '../config/index.ts';

// Import scenarios
import { pdpScenario } from '../scenarios/pdp.ts';

// Import types
import { TestProduct, SiteConfig } from '../types/index.ts';

const logger = createLogger('LoadTest');

// ============================================================================
// TEST CONFIGURATION — arrival-rate executor guarantees throughput targets
// regardless of response time, preventing the silent RPS collapse that occurs
// with ramping-vus when the system under test gets slow.
//
// Set QUICK_TEST=true to run a 30-second smoke pass (2 VUs, 5 req/min).
// ============================================================================

const isSmokeTest = __ENV.SMOKE_TEST === 'true';
const isQuickTest = __ENV.QUICK_TEST === 'true';

export const options: Options = {
  scenarios: isSmokeTest ? {
    // 1 VU × 1 iteration — full real-API assertions, no think time.
    // Use for CI smoke gate before committing to a 16-minute run.
    pdp_smoke: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '30s',
    },
  } : isQuickTest ? {
    pdp_smoke: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: '30s',
      preAllocatedVUs: 2,
      maxVUs: 5,
    },
  } : {
    pdp_load: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 20,
      maxVUs: 80,
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
    'scenario_pdp_success': customThresholds['scenario_pdp_success'],

    // Latency thresholds are meaningless for a single cold request — skip during smoke runs
    ...(isSmokeTest ? {} : {
      'http_req_duration': ['p(95)<800', 'p(99)<2000'],
      'http_req_waiting': ['p(95)<600'],
      'graphql_request_duration': ['p(95)<800', 'p(99)<2000'],
      'scenario_pdp_duration': customThresholds['scenario_pdp_duration'],
    }),
  },

  tags: {
    testType: 'load',
    scenario: 'pdp',
  },

  noConnectionReuse: false,
  userAgent: 'k6-load-test-pdp/1.0',
};

// ============================================================================
// TEST DATA — product providers created at module scope (init context),
// one DataProvider instance per VU. SharedArray memory is shared across all VUs.
// ============================================================================

const _platypusProvider  = getProductProviderForSite('platypus-au',  'random');
const _skechersProvider  = getProductProviderForSite('skechers-au',  'random');
const _drmartensProvider = getProductProviderForSite('drmartens-au', 'random');
const _vansAuProvider    = getProductProviderForSite('vans-au',       'random');
const _vansNzProvider    = getProductProviderForSite('vans-nz',       'random');

const SITE_PROVIDERS: Record<string, DataProvider<TestProduct>> = {
  'platypus-au':  _platypusProvider,
  'platypus-nz':  _platypusProvider,
  'skechers-au':  _skechersProvider,
  'skechers-nz':  _skechersProvider,
  'drmartens-au': _drmartensProvider,
  'drmartens-nz': _drmartensProvider,
  'vans-au':      _vansAuProvider,
  'vans-nz':      _vansNzProvider,
};

// ============================================================================
// MODULE-LEVEL CLIENT (created once per VU, not per iteration)
// ============================================================================

const _siteConfig = getSiteConfig();
const _client = new GraphQLClient(_siteConfig);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRandomProduct(siteId: string): TestProduct {
  const provider = SITE_PROVIDERS[siteId] ?? SITE_PROVIDERS['platypus-au'];
  return provider.getNext();
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

  // Fail fast: placeholder SKUs must be replaced before running a load test
  const provider = SITE_PROVIDERS[siteConfig.id];
  if (provider) {
    const sample = provider.getNext();
    if (sample.sku === 'PLACEHOLDER-SKU') {
      fail(
        `Site '${siteConfig.id}' has PLACEHOLDER-SKU entries in src/data/products-${siteConfig.id.replace(/-[a-z]{2}$/, '')}.json. ` +
        `Replace them with real in-stock SKUs from the ${siteConfig.id} storefront before running a load test.`
      );
    }
  }

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

export default function(data: SetupData): void {
  const { siteConfig, siteId } = data;
  const envConfig = getEnvironmentConfig();
  const vuId = exec.vu.idInTest;
  const iteration = exec.vu.iterationInScenario;

  const product = getRandomProduct(siteId);

  logger.debug(`VU ${vuId} - Iteration ${iteration} - Loading PDP: ${product.sku}`);

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

  if (!isSmokeTest) thinkTime(envConfig);
}

// ============================================================================
// TEARDOWN
// ============================================================================

export function teardown(data: SetupData): void {
  logger.info('=== Load Test Teardown ===');
  logger.info(`Site: ${data.siteConfig.name}`);
  logger.info('Load test completed');
}
