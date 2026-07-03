/**
 * Load Test — Mixed Journey (Realistic Traffic Mix)
 *
 * Models a realistic eCommerce traffic split running concurrently in a
 * single test, instead of one journey at a time:
 *   • 70% PDP browsing   (pdp_browse)
 *   • 20% PLP browsing   (plp_browse)
 *   //  • 10% guest checkout (guest_checkout — only runs when ENABLE_PLACE_ORDER=true)
 *
 * Each scenario points at its own exec function via the `exec` option, so
 * there is no shared default() — k6 dispatches VUs straight to the named
 * function for each scenario.
 *
 * guest_checkout is opt-in: every iteration places a real staging order, so
 * it is only registered in `options.scenarios` when ENABLE_PLACE_ORDER=true.
 * Without it, this test still exercises the realistic 70/20 browse mix.
 *
 * Usage:
 *   k6 run -e SITE=platypus-au -e ENVIRONMENT=staging src/tests/mixed-journey.test.ts
 *   k6 run -e SITE=platypus-au -e ENVIRONMENT=staging -e ENABLE_PLACE_ORDER=true src/tests/mixed-journey.test.ts
 *   k6 run -e SITE=platypus-au -e ENVIRONMENT=staging -e SMOKE_TEST=true src/tests/mixed-journey.test.ts
 */

import { check, fail, group } from 'k6';
import { Options } from 'k6/options';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

// Framework modules
import { GraphQLClient } from '../lib/graphql-client.ts';
import { createLogger } from '../lib/logger.ts';
import { thinkTime, getEnvVar } from '../lib/utils.ts';
import { customThresholds } from '../lib/metrics.ts';
import { getProductProviderForSite, getCategoryProvider } from '../lib/data-provider.ts';
import { randomItem } from '../lib/vendor/k6-utils.js';

// Configuration
import {
  getSiteConfig,
  getEnvironmentConfig,
  isDryRun,
  isProduction,
} from '../config/index.ts';

// Scenarios
import { pdpScenario } from '../scenarios/pdp.ts';
import { plpScenario } from '../scenarios/plp.ts';
import { placeOrderGuestScenario, PlaceOrderGuestInput } from '../scenarios/place-order.ts';

// Types
import { SiteConfig, TestAddress, CheckoutData } from '../types/index.ts';

const logger = createLogger('MixedJourneyTest');

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const isSmokeTest = __ENV.SMOKE_TEST === 'true';
// Read directly from __ENV (not from setup()) because `options` is built in
// the init context, before setup() runs.
const enablePlaceOrder = __ENV.ENABLE_PLACE_ORDER === 'true';

export const options: Options = {
  scenarios: isSmokeTest ? {
    mixed_pdp_smoke: {
      executor: 'per-vu-iterations',
      exec: 'pdpBrowse',
      vus: 1,
      iterations: 1,
      maxDuration: '30s',
    },
    mixed_plp_smoke: {
      executor: 'per-vu-iterations',
      exec: 'plpBrowse',
      vus: 1,
      iterations: 1,
      maxDuration: '30s',
    },
    ...(enablePlaceOrder ? {
      mixed_checkout_smoke: {
        executor: 'per-vu-iterations',
        exec: 'guestCheckout',
        vus: 1,
        iterations: 1,
        maxDuration: '60s',
      },
    } : {}),
  } : {
    // 70% of traffic: PDP browsing — same avg/peak targets as pdp-load.test.ts, scaled to 70%
    pdp_browse: {
      executor: 'ramping-arrival-rate',
      exec: 'pdpBrowse',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 20,
      maxVUs: 60,
      stages: [
        { duration: '2m', target: 140 },  // ramp to 70% of 200 req/min avg
        { duration: '5m', target: 140 },
        { duration: '2m', target: 350 },  // ramp to 70% of 500 req/min peak
        { duration: '5m', target: 350 },
        { duration: '2m', target: 0 },
      ],
    },
    // 20% of traffic: PLP browsing — same avg/peak targets as plp-load.test.ts, scaled to 20%
    plp_browse: {
      executor: 'ramping-arrival-rate',
      exec: 'plpBrowse',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 10,
      maxVUs: 30,
      stages: [
        { duration: '2m', target: 40 },   // ramp to 20% of 200 req/min avg
        { duration: '5m', target: 40 },
        { duration: '2m', target: 100 },  // ramp to 20% of 500 req/min peak
        { duration: '5m', target: 100 },
        { duration: '2m', target: 0 },
      ],
    },
    // 10% of traffic: guest checkout. Kept at a low constant rate independent
    // of the PDP/PLP ramp — each iteration places a real order on staging, so
    // this deliberately does NOT scale up to "10% of 500/min" (50/min would
    // flood staging with orders). Only registered when ENABLE_PLACE_ORDER=true.
    ...(enablePlaceOrder ? {
      guest_checkout: {
        executor: 'constant-arrival-rate',
        exec: 'guestCheckout',
        rate: 10,
        timeUnit: '1m',
        duration: '14m',
        startTime: '1m',
        preAllocatedVUs: 5,
        maxVUs: 15,
      },
    } : {}),
  },

  thresholds: {
    // Error rates — split per k6 scenario name via tag filters so PDP/PLP
    // (read-only queries) stay strict while checkout (mutation-heavy, slower
    // staging endpoints) gets the same tolerance as place-order.test.ts.
    'http_req_failed{scenario:pdp_browse}': [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
    'http_req_failed{scenario:plp_browse}': [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
    'graphql_errors{scenario:pdp_browse}': [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
    'graphql_errors{scenario:plp_browse}': [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
    'scenario_pdp_success': customThresholds['scenario_pdp_success'],
    'scenario_plp_success': customThresholds['scenario_plp_success'],

    ...(enablePlaceOrder ? {
      'http_req_failed{scenario:guest_checkout}': [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],
      'graphql_errors{scenario:guest_checkout}': [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],
      'scenario_place_order_success': customThresholds['scenario_place_order_success'],
    } : {}),

    // Latency thresholds are meaningless for a single cold request — skip during smoke runs
    ...(isSmokeTest ? {} : {
      'graphql_request_duration{scenario:pdp_browse}': ['p(95)<800', 'p(99)<2000'],
      'graphql_request_duration{scenario:plp_browse}': ['p(95)<800', 'p(99)<2000'],
      'scenario_pdp_duration': customThresholds['scenario_pdp_duration'],
      'scenario_plp_duration': customThresholds['scenario_plp_duration'],
      ...(enablePlaceOrder ? {
        // Staging is slower than production; mirrors place-order.test.ts thresholds
        'graphql_request_duration{scenario:guest_checkout}': ['p(95)<7000'],
        'scenario_place_order_duration': ['p(95)<20000', 'p(99)<30000'],
      } : {}),
    }),
  },

  tags: {
    testType: 'load',
    scenario: 'mixed-journey',
  },

  noConnectionReuse: false,
  userAgent: 'k6-load-test-mixed-journey/1.0',
};

// ============================================================================
// TEST DATA — created at module scope (init context), once per VU.
// This test targets a single SITE per run, same as the other test files.
// ============================================================================

const _siteConfig = getSiteConfig();
const _client = new GraphQLClient(_siteConfig);
const _productProvider = getProductProviderForSite(_siteConfig.id, 'random');
const _categoryProvider = getCategoryProvider(_siteConfig.id);

/** Australian test addresses — only loaded/used when checkout is enabled */
const AU_ADDRESSES = new SharedArray('mixed-au-addresses', function () {
  const raw = JSON.parse(open('../data/addresses.json')) as { data: TestAddress[] };
  return raw.data.filter(a => a.country_code === 'AU' && a.isDeliverable);
});

/** New Zealand test addresses — only loaded/used when checkout is enabled */
const NZ_ADDRESSES = new SharedArray('mixed-nz-addresses', function () {
  const raw = JSON.parse(open('../data/addresses-nz.json')) as { data: TestAddress[] };
  return raw.data.filter(a => a.country_code === 'NZ' && a.isDeliverable);
});

function getAddressPool(): TestAddress[] {
  return _siteConfig.id.endsWith('-nz')
    ? (NZ_ADDRESSES as unknown as TestAddress[])
    : (AU_ADDRESSES as unknown as TestAddress[]);
}

function buildCheckoutData(address: TestAddress, paymentMethod: string): CheckoutData {
  const addr = {
    firstname: address.firstname,
    lastname: address.lastname,
    street: address.street,
    city: address.city,
    region: address.region,
    region_id: address.region_id ?? undefined,
    postcode: address.postcode,
    country_code: address.country_code,
    telephone: address.telephone,
    save_in_address_book: false,
  };

  return {
    shippingAddress: addr,
    billingAddress: addr,
    paymentMethodCode: paymentMethod,
  };
}

// ============================================================================
// SETUP
// ============================================================================

interface SetupData {
  siteConfig: SiteConfig;
  paymentMethod: string;
  enablePlaceOrder: boolean;
}

export function setup(): SetupData {
  logger.info('=== Mixed Journey Load Test Setup ===');

  const siteConfig = getSiteConfig();
  const paymentMethod = getEnvVar('PAYMENT_METHOD', 'checkmo');

  logger.info(`Site: ${siteConfig.name}`);
  logger.info(`GraphQL Endpoint: ${siteConfig.graphqlEndpoint}`);
  logger.info(`Is Production: ${isProduction()}`);
  logger.info(`Dry Run: ${isDryRun()}`);
  logger.info(`Guest checkout scenario: ${enablePlaceOrder ? 'ENABLED (10 orders/min)' : 'disabled (browse-only mix)'}`);
  logger.info(`Categories loaded: ${_categoryProvider.count()}`);

  // Fail fast: placeholder SKUs must be replaced before running a load test
  const sample = _productProvider.getNext();
  if (sample.sku === 'PLACEHOLDER-SKU') {
    fail(
      `Site '${siteConfig.id}' has PLACEHOLDER-SKU entries in src/data/products-${siteConfig.id.replace(/-[a-z]{2}$/, '')}.json. ` +
      `Replace them with real in-stock SKUs from the ${siteConfig.id} storefront before running a load test.`
    );
  }

  if (isProduction()) {
    logger.warn('⚠️  Running load test against PRODUCTION');
    logger.warn('⚠️  Ensure this is authorized and monitored');
  }

  return { siteConfig, paymentMethod, enablePlaceOrder };
}

// ============================================================================
// SCENARIO EXEC FUNCTIONS — each k6 scenario above dispatches straight to one
// of these via `exec`, so there is no shared default() for this test.
// ============================================================================

export function pdpBrowse(data: SetupData): void {
  const envConfig = getEnvironmentConfig();
  const product = _productProvider.getNext();

  group('PDP Load', () => {
    const { result, product: loadedProduct } = pdpScenario(
      { sku: product.sku },
      _client,
      data.siteConfig
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

export function plpBrowse(data: SetupData): void {
  const envConfig = getEnvironmentConfig();
  const category = _categoryProvider.getByVU();

  group('PLP Load', () => {
    const { result, category: resolvedCategory, productCount } = plpScenario(
      { urlPath: category.urlPath, name: category.name },
      _client,
      data.siteConfig
    );

    check(result, {
      'PLP load completed': (r) => r.success,
      'Category was found': () => resolvedCategory !== null,
      'Products returned': () => productCount > 0,
    });

    if (!result.success) {
      logger.warn(`PLP load issue for ${category.urlPath}: ${result.error ?? 'Unknown error'}`);
    }
  });

  if (!isSmokeTest) thinkTime(envConfig);
}

export function guestCheckout(data: SetupData): void {
  const { siteConfig, paymentMethod, enablePlaceOrder: enabled } = data;
  const envConfig = getEnvironmentConfig();
  const vuId = exec.vu.idInTest;

  if (!enabled && !isDryRun()) {
    logger.warn(`⚠️  VU ${vuId} – ENABLE_PLACE_ORDER=false – skipping guest checkout iteration.`);
    return;
  }

  const product = _productProvider.getNext();
  const address = randomItem(getAddressPool()) as TestAddress;
  const checkoutData = buildCheckoutData(address, paymentMethod);

  const scenarioInput: PlaceOrderGuestInput = {
    sku: product.sku,
    productType: product.productType as 'simple' | 'configurable',
    quantity: 1,
    checkoutData,
  };

  group('Guest Checkout – Place Order', () => {
    const { result, orderNumber } = placeOrderGuestScenario(scenarioInput, _client, siteConfig);

    check(result, {
      'Place order succeeded': (r) => r.success,
      'Order number returned': () => !!orderNumber,
    });

    if (result.success) {
      logger.info(`✅  VU ${vuId} – order ${orderNumber} placed | ${result.duration}ms`);
    } else {
      logger.error(`❌  VU ${vuId} – place-order FAILED: ${result.error ?? 'unknown error'}`);
    }
  });

  if (!isSmokeTest) thinkTime(envConfig);
}

// ============================================================================
// TEARDOWN
// ============================================================================

export function teardown(data: SetupData): void {
  logger.info('=== Mixed Journey Load Test Teardown ===');
  logger.info(`Site: ${data.siteConfig.name}`);
  logger.info('Mixed journey load test completed');
}
