/**
 * Load Test – Vans Place Order (Guest Checkout)
 *
 * Covers guest checkout end-to-end for:
 *   • vans-au  (AUD, stag-vans-au.accentgra.com)
 *   • vans-nz  (NZD, stag-vans-nz.accentgra.com)
 *
 * Prerequisite:
 *   Run the product discovery script to populate real Vans SKUs before
 *   running this test:
 *     node discover-products.js --site vans-au
 *     node discover-products.js --site vans-nz
 *   Then replace the PLACEHOLDER-SKU entries in VANS_PRODUCTS below.
 *
 * Usage:
 *   # Vans AU
 *   k6 run --env SITE=vans-au --env ENABLE_PLACE_ORDER=true \
 *          dist/tests/vans-place-order.test.js
 *
 *   # Vans NZ
 *   k6 run --env SITE=vans-nz --env ENABLE_PLACE_ORDER=true \
 *          dist/tests/vans-place-order.test.js
 *
 *   # Optional overrides
 *   k6 run --env SITE=vans-au --env ENABLE_PLACE_ORDER=true \
 *          --env PAYMENT_METHOD=checkmo --env DRY_RUN=false \
 *          dist/tests/vans-place-order.test.js
 *
 * Safety:
 *   ENABLE_PLACE_ORDER must be explicitly set to "true" or the test will
 *   skip the place-order step and log a warning (dry-checkout mode).
 *
 *   The staging environment does NOT charge real money, but orders are
 *   recorded in Magento – keep VU counts low on shared staging instances.
 */

import { check, group } from 'k6';
import { Options } from 'k6/options';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

// @ts-expect-error - k6 remote module import
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

import { getProductProviderForSite } from '../lib/data-provider';

// Framework modules
import { GraphQLClient } from '../lib/graphql-client';
import { createLogger } from '../lib/logger';
import { thinkTime, getEnvVar, getEnvBool } from '../lib/utils';
import { customThresholds } from '../lib/metrics';

// Configuration
import {
  getSiteConfig,
  getEnvironmentConfig,
  isDryRun,
  isProduction,
} from '../config';

// Scenario
import { placeOrderGuestScenario, PlaceOrderGuestInput } from '../scenarios/place-order';

// Types
import { SiteConfig, TestProduct, TestAddress, CheckoutData } from '../types';

const logger = createLogger('VansPlaceOrderTest');

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

/**
 * k6 Options – conservative arrival rate to avoid flooding staging with orders.
 *
 * ramping-arrival-rate guarantees exactly N orders/min regardless of how long
 * each checkout takes. With the old ramping-vus approach, a slow staging server
 * would silently reduce throughput, masking the actual breaking point.
 *
 * Total runtime ≈ 10 minutes.
 */
export const options: Options = {
  scenarios: {
    vans_place_order: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 5,
      maxVUs: 15,
      stages: [
        { duration: '1m', target: 5 },   // warm-up: ramp to 5/min
        { duration: '8m', target: 5 },   // steady: 5 orders/min
        { duration: '1m', target: 0 },   // ramp-down
      ],
    },
  },

  thresholds: {
    // HTTP — staging servers are slower than production; thresholds reflect observed staging latency
    'http_req_duration': ['p(95)<7000', 'p(99)<12000'],
    'http_req_failed':   ['rate<0.05'],

    // GraphQL
    'graphql_errors':             ['rate<0.05'],
    'graphql_request_duration':   ['p(95)<7000'],

    // Place-order specific
    // Override scenario_place_order_duration — full 9-step flow takes ~13 s on staging
    'scenario_place_order_duration': ['p(95)<20000', 'p(99)<30000'],
    'scenario_place_order_success':  customThresholds['scenario_place_order_success'],
    'place_order_guest_cart_success': ['rate>0.95'],
    'place_order_add_to_cart_success': ['rate>0.90'],
    'place_order_success': ['rate>0.85'],

    // Step timing — placeOrder mutation alone takes ~6 s on staging
    'place_order_guest_cart_create_time':  ['p(95)<2000'],
    'place_order_add_to_cart_time':        ['p(95)<3000'],
    'place_order_set_shipping_addr_time':  ['p(95)<3000'],
    'place_order_set_shipping_meth_time':  ['p(95)<3000'],
    'place_order_set_billing_addr_time':   ['p(95)<3000'],
    'place_order_set_payment_meth_time':   ['p(95)<3000'],
    'place_order_mutation_time':           ['p(95)<8000'],  // placeOrder is the heaviest step
  },

  tags: {
    testType:  'load',
    scenario:  'place-order-guest',
    brand:     'vans',
  },

  noConnectionReuse: false,
  userAgent: 'k6-load-test-vans-place-order/1.0',
};

// ============================================================================
// TEST DATA — product providers created at module scope (init context).
// SKU lists live in src/data/products-vans-{au,nz}.json.
// ============================================================================

const _vansAuProvider = getProductProviderForSite('vans-au', 'random');
const _vansNzProvider = getProductProviderForSite('vans-nz', 'random');

/** Australian test addresses loaded from data file */
const AU_ADDRESSES = new SharedArray('au-addresses', function () {
  const raw = JSON.parse(open('../data/addresses.json')) as {
    data: TestAddress[];
  };
  return raw.data.filter(a => a.country_code === 'AU' && a.isDeliverable);
});

/** New Zealand test addresses loaded from data file */
const NZ_ADDRESSES = new SharedArray('nz-addresses', function () {
  const raw = JSON.parse(open('../data/addresses-nz.json')) as {
    data: TestAddress[];
  };
  return raw.data.filter(a => a.country_code === 'NZ' && a.isDeliverable);
});

// ============================================================================
// MODULE-LEVEL CLIENT  (one client per VU, re-used across iterations)
// ============================================================================

const _siteConfig = getSiteConfig();
const _client     = new GraphQLClient(_siteConfig);

// ============================================================================
// HELPERS
// ============================================================================

/** Pick a random product for the given Vans site */
function getRandomProduct(siteId: string): TestProduct {
  return siteId === 'vans-nz' ? _vansNzProvider.getNext() : _vansAuProvider.getNext();
}

/** Choose the address pool that matches the site's country */
function getAddressPool(siteId: string): TestAddress[] {
  return siteId.endsWith('-nz')
    ? (NZ_ADDRESSES as unknown as TestAddress[])
    : (AU_ADDRESSES as unknown as TestAddress[]);
}

/** Build CheckoutData from a random address + configurable options */
function buildCheckoutData(address: TestAddress, paymentMethod: string): CheckoutData {
  const addr = {
    firstname:   address.firstname,
    lastname:    address.lastname,
    street:      address.street,
    city:        address.city,
    region:      address.region,
    region_id:   address.region_id ?? undefined,
    postcode:    address.postcode,
    country_code: address.country_code,
    telephone:   address.telephone,
    save_in_address_book: false,
  };

  return {
    shippingAddress: addr,
    billingAddress:  addr,           // same-as-shipping for load testing
    paymentMethodCode: paymentMethod, // e.g. 'checkmo', 'free'
    // shippingCarrierCode / shippingMethodCode intentionally omitted:
    // the scenario will auto-select the first available method.
  };
}

// ============================================================================
// SETUP
// ============================================================================

interface SetupData {
  siteConfig:     SiteConfig;
  siteId:         string;
  paymentMethod:  string;
  enablePlaceOrder: boolean;
}

export function setup(): SetupData {
  logger.info('=== Vans Place Order Load Test – Setup ===');

  const siteConfig      = getSiteConfig();
  const envConfig       = getEnvironmentConfig();
  const paymentMethod   = getEnvVar('PAYMENT_METHOD', 'checkmo');
  const enablePlaceOrder = getEnvBool('ENABLE_PLACE_ORDER', false);

  logger.info(`Site:                ${siteConfig.name}`);
  logger.info(`GraphQL Endpoint:    ${siteConfig.graphqlEndpoint}`);
  logger.info(`Environment:         ${envConfig.environment}`);
  logger.info(`Payment Method:      ${paymentMethod}`);
  logger.info(`Enable Place Order:  ${enablePlaceOrder}`);
  logger.info(`Dry Run:             ${isDryRun()}`);

  // Validate site selection
  if (!['vans-au', 'vans-nz'].includes(siteConfig.id)) {
    logger.warn(`⚠️  Site '${siteConfig.id}' is not in [vans-au, vans-nz]. `
      + `Set --env SITE=vans-au or --env SITE=vans-nz.`);
  }

  if (!enablePlaceOrder) {
    logger.warn('⚠️  ENABLE_PLACE_ORDER is not set – iterations will be skipped.');
    logger.warn('⚠️  Set --env ENABLE_PLACE_ORDER=true to run actual checkout.');
  }

  if (isProduction()) {
    logger.warn('⚠️  Running against PRODUCTION – proceeding requires explicit authorisation.');
  }

  return { siteConfig, siteId: siteConfig.id, paymentMethod, enablePlaceOrder };
}

// ============================================================================
// DEFAULT FUNCTION  (MAIN TEST)
// ============================================================================

/**
 * One iteration = one complete guest checkout for a randomly selected product.
 */
export default function (data: SetupData): void {
  const { siteConfig, siteId, paymentMethod, enablePlaceOrder } = data;
  const envConfig  = getEnvironmentConfig();
  const vuId       = exec.vu.idInTest;
  const iteration  = exec.vu.iterationInScenario;

  // ── Guard: place-order not opted in ─────────────────────────────────────
  if (!enablePlaceOrder && !isDryRun()) {
    logger.warn(
      `⚠️  VU ${vuId} – ENABLE_PLACE_ORDER=false – skipping. `
      + `Set --env ENABLE_PLACE_ORDER=true to run the full checkout.`
    );
    return;
  }

  // ── Pick random product + address ────────────────────────────────────────
  const product      = getRandomProduct(siteId);
  const addressPool  = getAddressPool(siteId);
  const address      = randomItem(addressPool) as TestAddress;
  const checkoutData = buildCheckoutData(address, paymentMethod);

  logger.debug(
    `VU ${vuId} iter ${iteration} | SKU: ${product.sku} | `
    + `Addr: ${address.label ?? address.city} | Payment: ${paymentMethod}`
  );

  // ── Execute the full guest place-order scenario ──────────────────────────
  const scenarioInput: PlaceOrderGuestInput = {
    sku:          product.sku,
    productType:  product.productType as 'simple' | 'configurable',
    quantity:     1,
    checkoutData,
  };

  group('Guest Checkout – Place Order', () => {
    const { result, orderNumber } = placeOrderGuestScenario(
      scenarioInput,
      _client,
      siteConfig
    );

    check(result, {
      'Place order succeeded':      (r) => r.success,
      'Order number returned':      () => !!orderNumber,
      // Staging servers are slower than production – 25 s cap for full 9-step flow
      'Duration under 25 seconds':  (r) => r.duration < 25_000,
    });

    if (result.success) {
      logger.info(`✅  VU ${vuId} iter ${iteration} – order ${orderNumber} placed | ${result.duration}ms`);
    } else {
      logger.error(
        `❌  VU ${vuId} iter ${iteration} – place-order FAILED: ${result.error ?? 'unknown error'}`
      );
    }
  });

  // Simulate post-order browsing / confirmation page read time
  thinkTime(envConfig);
}

// ============================================================================
// TEARDOWN
// ============================================================================

export function teardown(data: SetupData): void {
  logger.info('=== Vans Place Order Load Test – Teardown ===');
  logger.info(`Site:        ${data.siteConfig.name}`);
  logger.info(`Test complete. Check Magento order grid for staged test orders.`);
}
