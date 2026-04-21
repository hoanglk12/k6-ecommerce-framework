/**
 * Custom Metrics Module
 * 
 * Defines custom k6 metrics for business KPIs and detailed performance tracking.
 * These metrics extend the default k6 metrics to provide eCommerce-specific insights.
 */

import { Counter, Gauge, Rate, Trend } from 'k6/metrics';

// ============================================================================
// SCENARIO METRICS
// ============================================================================

/** Login scenario duration */
export const loginDuration = new Trend('scenario_login_duration', true);
/** Login success rate */
export const loginSuccess = new Rate('scenario_login_success');
/** Login attempts counter */
export const loginAttempts = new Counter('scenario_login_attempts');

/** PDP (Product Detail Page) load duration */
export const pdpDuration = new Trend('scenario_pdp_duration', true);
/** PDP success rate */
export const pdpSuccess = new Rate('scenario_pdp_success');
/** PDP views counter */
export const pdpViews = new Counter('scenario_pdp_views');

/** PLP (Product Listing Page) load duration */
export const plpDuration = new Trend('scenario_plp_duration', true);
/** PLP success rate */
export const plpSuccess = new Rate('scenario_plp_success');
/** PLP views counter */
export const plpViews = new Counter('scenario_plp_views');

/** Add to cart duration */
export const addToCartDuration = new Trend('scenario_add_to_cart_duration', true);
/** Add to cart success rate */
export const addToCartSuccess = new Rate('scenario_add_to_cart_success');
/** Add to cart attempts counter */
export const addToCartAttempts = new Counter('scenario_add_to_cart_attempts');

/** Checkout duration */
export const checkoutDuration = new Trend('scenario_checkout_duration', true);
/** Checkout success rate */
export const checkoutSuccess = new Rate('scenario_checkout_success');
/** Checkout attempts counter */
export const checkoutAttempts = new Counter('scenario_checkout_attempts');

/** Order placement duration */
export const placeOrderDuration = new Trend('scenario_place_order_duration', true);
/** Order placement success rate */
export const placeOrderSuccess = new Rate('scenario_place_order_success');
/** Orders placed counter */
export const ordersPlaced = new Counter('scenario_orders_placed');

// ============================================================================
// BUSINESS METRICS
// ============================================================================

/** Cart value trend */
export const cartValue = new Trend('business_cart_value', false);
/** Average items per cart */
export const cartItems = new Trend('business_cart_items', false);
/** Conversion rate (orders/sessions) */
export const conversionRate = new Rate('business_conversion_rate');
/** Cart abandonment rate */
export const cartAbandonmentRate = new Rate('business_cart_abandonment');

/** Current active sessions gauge */
export const activeSessions = new Gauge('business_active_sessions');
/** Current active carts gauge */
export const activeCarts = new Gauge('business_active_carts');

// ============================================================================
// GRAPHQL METRICS
// ============================================================================

/** GraphQL query duration */
export const gqlQueryDuration = new Trend('graphql_query_duration', true);
/** GraphQL mutation duration */
export const gqlMutationDuration = new Trend('graphql_mutation_duration', true);
/** GraphQL error rate */
export const gqlErrorRate = new Rate('graphql_error_rate');
/** GraphQL requests by operation */
export const gqlOperations = new Counter('graphql_operations');

// ============================================================================
// INFRASTRUCTURE METRICS
// ============================================================================

/** Time to First Byte */
export const ttfb = new Trend('infra_ttfb', true);
/** DNS lookup time */
export const dnsLookup = new Trend('infra_dns_lookup', true);
/** TLS handshake time */
export const tlsHandshake = new Trend('infra_tls_handshake', true);
/** Connection time */
export const connectionTime = new Trend('infra_connection_time', true);

// ============================================================================
// THRESHOLD DEFINITIONS
// ============================================================================

/**
 * Default threshold configuration for custom metrics
 * Use these in your test options
 */
export const customThresholds = {
  // Scenario thresholds
  'scenario_login_duration': ['p(95)<3000', 'p(99)<5000'],
  'scenario_login_success': ['rate>0.95'],
  'scenario_pdp_duration': ['p(95)<2000', 'p(99)<4000'],
  'scenario_pdp_success': ['rate>0.99'],
  'scenario_plp_duration': ['p(95)<3000', 'p(99)<5000'],
  'scenario_plp_success': ['rate>0.95'],
  'scenario_add_to_cart_duration': ['p(95)<2500', 'p(99)<5000'],
  'scenario_add_to_cart_success': ['rate>0.95'],
  'scenario_checkout_duration': ['p(95)<5000', 'p(99)<10000'],
  'scenario_checkout_success': ['rate>0.90'],
  'scenario_place_order_duration': ['p(95)<8000', 'p(99)<15000'],
  'scenario_place_order_success': ['rate>0.90'],
  
  // GraphQL thresholds
  'graphql_query_duration': ['p(95)<800', 'p(99)<2000'],
  'graphql_mutation_duration': ['p(95)<1500', 'p(99)<3000'],
  'graphql_error_rate': ['rate<0.01'],
  
  // Infrastructure thresholds
  'infra_ttfb': ['p(95)<200'],
};

// ============================================================================
// METRIC RECORDING HELPERS
// ============================================================================

/** Valid scenario names for recordScenarioMetrics */
export type ScenarioName = 'login' | 'pdp' | 'plp' | 'addToCart' | 'checkout' | 'placeOrder';

/**
 * Record scenario execution metrics
 *
 * @param scenario - Scenario name
 * @param duration - Execution duration in ms
 * @param success - Whether scenario succeeded
 * @param tags - Additional tags
 */
export function recordScenarioMetrics(
  scenario: ScenarioName,
  duration: number,
  success: boolean,
  tags: Record<string, string> = {}
): void {
  const scenarioTags = { scenario, ...tags };
  
  switch (scenario) {
    case 'login':
      loginDuration.add(duration, scenarioTags);
      loginSuccess.add(success ? 1 : 0, scenarioTags);
      loginAttempts.add(1, scenarioTags);
      break;
    case 'pdp':
      pdpDuration.add(duration, scenarioTags);
      pdpSuccess.add(success ? 1 : 0, scenarioTags);
      pdpViews.add(1, scenarioTags);
      break;
    case 'plp':
      plpDuration.add(duration, scenarioTags);
      plpSuccess.add(success ? 1 : 0, scenarioTags);
      plpViews.add(1, scenarioTags);
      break;
    case 'addToCart':
      addToCartDuration.add(duration, scenarioTags);
      addToCartSuccess.add(success ? 1 : 0, scenarioTags);
      addToCartAttempts.add(1, scenarioTags);
      break;
    case 'checkout':
      checkoutDuration.add(duration, scenarioTags);
      checkoutSuccess.add(success ? 1 : 0, scenarioTags);
      checkoutAttempts.add(1, scenarioTags);
      break;
    case 'placeOrder':
      placeOrderDuration.add(duration, scenarioTags);
      placeOrderSuccess.add(success ? 1 : 0, scenarioTags);
      ordersPlaced.add(success ? 1 : 0, scenarioTags);
      break;
  }
}

/**
 * Record GraphQL operation metrics
 * 
 * @param operationType - 'query' or 'mutation'
 * @param operationName - Name of the operation
 * @param duration - Execution duration in ms
 * @param hasError - Whether the operation had errors
 */
export function recordGraphQLMetrics(
  operationType: 'query' | 'mutation',
  operationName: string,
  duration: number,
  hasError: boolean
): void {
  const tags = { operation: operationName };
  
  if (operationType === 'query') {
    gqlQueryDuration.add(duration, tags);
  } else {
    gqlMutationDuration.add(duration, tags);
  }
  
  gqlErrorRate.add(hasError ? 1 : 0, tags);
  gqlOperations.add(1, { ...tags, type: operationType });
}

/**
 * Record business metrics for cart
 * 
 * @param value - Cart total value
 * @param itemCount - Number of items in cart
 */
export function recordCartMetrics(value: number, itemCount: number): void {
  cartValue.add(value);
  cartItems.add(itemCount);
}

/**
 * Record HTTP timing metrics
 * 
 * @param timings - HTTP response timings
 */
export function recordTimingMetrics(timings: {
  waiting: number;
  dns_lookup?: number;
  tls_handshaking?: number;
  connecting?: number;
}): void {
  ttfb.add(timings.waiting);
  
  if (timings.dns_lookup !== undefined) {
    dnsLookup.add(timings.dns_lookup);
  }
  if (timings.tls_handshaking !== undefined) {
    tlsHandshake.add(timings.tls_handshaking);
  }
  if (timings.connecting !== undefined) {
    connectionTime.add(timings.connecting);
  }
}
