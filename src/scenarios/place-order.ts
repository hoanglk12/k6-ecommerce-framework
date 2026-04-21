/**
 * Place Order – Guest Checkout Scenario
 *
 * End-to-end guest checkout flow using Magento 2 GraphQL:
 *   1. createGuestCart
 *   2. Resolve in-stock variant (configurable products only)
 *   3. addConfigurableProductsToCart / addSimpleProductsToCart
 *   4. setGuestEmailOnCart
 *   5. setShippingAddressesOnCart  (returns available shipping methods)
 *   6. setShippingMethodsOnCart    (first available method)
 *   7. setBillingAddressOnCart
 *   8. setPaymentMethodOnCart      (first available / env default)
 *   9. placeOrder
 *
 * Designed for staging only – no real money is charged.
 * For production, set PRODUCTION_CONFIRMED=true and ENABLE_PLACE_ORDER=true.
 */

import { check, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { GraphQLClient, checkGraphQLResponse } from '../lib/graphql-client';
import { createLogger } from '../lib/logger';
import { measureTime, randomEmail } from '../lib/utils';
import { recordScenarioMetrics } from '../lib/metrics';
import { getSiteConfig, isDryRun } from '../config';
import {
  SiteConfig,
  ScenarioResult,
  AddressInput,
  CheckoutData,
} from '../types';

// @ts-expect-error - k6 remote module import
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const logger = createLogger('PlaceOrderScenario');

// ============================================================================
// SCENARIO METRICS
// ============================================================================

const guestCartCreateTime  = new Trend('place_order_guest_cart_create_time',  true);
const addToCartTime        = new Trend('place_order_add_to_cart_time',         true);
const setShippingAddrTime  = new Trend('place_order_set_shipping_addr_time',   true);
const setShippingMethTime  = new Trend('place_order_set_shipping_meth_time',   true);
const setBillingAddrTime   = new Trend('place_order_set_billing_addr_time',    true);
const setPaymentMethTime   = new Trend('place_order_set_payment_meth_time',    true);
const placeOrderTime       = new Trend('place_order_mutation_time',            true);

const guestCartSuccess     = new Rate('place_order_guest_cart_success');
const addToCartSuccess     = new Rate('place_order_add_to_cart_success');
const placeOrderSuccessRate = new Rate('place_order_success');
const ordersTotal          = new Counter('place_order_total_orders');

// ============================================================================
// GRAPHQL OPERATIONS
// ============================================================================

/**
 * Create an anonymous guest cart and return its masked ID.
 * In Magento 2 GraphQL, createEmptyCart without an auth token creates a guest cart.
 * The mutation returns the cart ID string directly.
 */
const CREATE_GUEST_CART = `
  mutation CreateGuestCart {
    createEmptyCart
  }
`;

/**
 * Fetch a configurable product and its in-stock variants.
 * Used to auto-select a purchasable child SKU at runtime.
 */
const GET_CONFIGURABLE_PRODUCT_VARIANTS = `
  query GetConfigurableProductVariants($sku: String!) {
    products(filter: { sku: { eq: $sku } }) {
      items {
        id
        sku
        name
        __typename
        stock_status
        ... on ConfigurableProduct {
          variants {
            product {
              id
              sku
              stock_status
            }
            attributes {
              code
              value_index
            }
          }
        }
      }
      total_count
    }
  }
`;

/** Add a configurable product (parent + variant SKU) to a guest cart */
const ADD_CONFIGURABLE_TO_CART = `
  mutation AddConfigurableProductsToCart($cartId: String!, $parentSku: String!, $variantSku: String!, $qty: Float!) {
    addConfigurableProductsToCart(input: {
      cart_id: $cartId
      cart_items: [{
        parent_sku: $parentSku
        data: { sku: $variantSku, quantity: $qty }
      }]
    }) {
      cart {
        id
        total_quantity
        items {
          uid
          quantity
          product { sku name __typename }
        }
      }
    }
  }
`;

/** Add a simple product to a guest cart */
const ADD_SIMPLE_TO_CART = `
  mutation AddSimpleProductsToCart($cartId: String!, $sku: String!, $qty: Float!) {
    addSimpleProductsToCart(input: {
      cart_id: $cartId
      cart_items: [{ data: { sku: $sku, quantity: $qty } }]
    }) {
      cart {
        id
        total_quantity
        items {
          uid
          quantity
          product { sku name __typename }
        }
      }
    }
  }
`;

/** Associate a guest email address with the cart (required before checkout) */
const SET_GUEST_EMAIL = `
  mutation SetGuestEmailOnCart($cartId: String!, $email: String!) {
    setGuestEmailOnCart(input: { cart_id: $cartId, email: $email }) {
      cart {
        email
      }
    }
  }
`;

/** Set shipping address and retrieve available shipping methods in one call */
const SET_SHIPPING_ADDRESS = `
  mutation SetShippingAddressesOnCart($cartId: String!, $address: CartAddressInput!) {
    setShippingAddressesOnCart(input: {
      cart_id: $cartId
      shipping_addresses: [{
        address: $address
      }]
    }) {
      cart {
        shipping_addresses {
          firstname
          lastname
          city
          country { code label }
          available_shipping_methods {
            carrier_code
            method_code
            carrier_title
            method_title
            available
            amount { value currency }
          }
          selected_shipping_method {
            carrier_code
            method_code
            carrier_title
            method_title
          }
        }
      }
    }
  }
`;

/** Set the selected shipping method on the cart */
const SET_SHIPPING_METHOD = `
  mutation SetShippingMethodsOnCart($cartId: String!, $carrierCode: String!, $methodCode: String!) {
    setShippingMethodsOnCart(input: {
      cart_id: $cartId
      shipping_methods: [{
        carrier_code: $carrierCode
        method_code:  $methodCode
      }]
    }) {
      cart {
        shipping_addresses {
          selected_shipping_method {
            carrier_code
            method_code
            carrier_title
            method_title
            amount { value currency }
          }
        }
        prices {
          grand_total { value currency }
        }
      }
    }
  }
`;

/** Set the billing address on the cart */
const SET_BILLING_ADDRESS = `
  mutation SetBillingAddressOnCart($cartId: String!, $address: CartAddressInput!) {
    setBillingAddressOnCart(input: {
      cart_id: $cartId
      billing_address: { address: $address }
    }) {
      cart {
        billing_address {
          firstname
          lastname
          city
          country { code }
        }
      }
    }
  }
`;

/** Set the payment method and return available methods for validation */
const SET_PAYMENT_METHOD = `
  mutation SetPaymentMethodOnCart($cartId: String!, $paymentCode: String!) {
    setPaymentMethodOnCart(input: {
      cart_id: $cartId
      payment_method: { code: $paymentCode }
    }) {
      cart {
        selected_payment_method { code title }
        available_payment_methods { code title }
        prices {
          grand_total { value currency }
        }
      }
    }
  }
`;

/** Execute the final place order mutation */
const PLACE_ORDER = `
  mutation PlaceOrder($cartId: String!) {
    placeOrder(input: { cart_id: $cartId }) {
      order {
        order_number
      }
    }
  }
`;

// ============================================================================
// INTERNAL RESPONSE TYPES
// ============================================================================

interface CreateGuestCartResponse {
  createEmptyCart: string;
}

interface ConfigurableProductVariantsResponse {
  products: {
    items: Array<{
      id: number;
      sku: string;
      name: string;
      __typename: string;
      stock_status: string;
      variants?: Array<{
        product: { id: number; sku: string; stock_status: string };
        attributes: Array<{ code: string; value_index: number }>;
      }>;
    }>;
    total_count: number;
  };
}

interface ShippingMethod {
  carrier_code: string;
  method_code: string;
  carrier_title: string;
  method_title: string;
  available: boolean;
  amount: { value: number; currency: string };
}

interface SetShippingAddressResponse {
  setShippingAddressesOnCart: {
    cart: {
      shipping_addresses: Array<{
        firstname: string;
        lastname: string;
        city: string;
        country: { code: string; label: string };
        available_shipping_methods: ShippingMethod[];
        selected_shipping_method: { carrier_code: string; method_code: string } | null;
      }>;
    };
  };
}

interface SetShippingMethodResponse {
  setShippingMethodsOnCart: {
    cart: {
      shipping_addresses: Array<{
        selected_shipping_method: {
          carrier_code: string;
          method_code: string;
          carrier_title: string;
          amount: { value: number; currency: string };
        };
      }>;
      prices: { grand_total: { value: number; currency: string } };
    };
  };
}

interface SetPaymentMethodResponse {
  setPaymentMethodOnCart: {
    cart: {
      selected_payment_method: { code: string; title: string };
      available_payment_methods: Array<{ code: string; title: string }>;
      prices: { grand_total: { value: number; currency: string } };
    };
  };
}

interface PlaceOrderResponse {
  placeOrder: { order: { order_number: string } };
}

interface AddConfigurableToCartResponse {
  addConfigurableProductsToCart: {
    cart: { total_quantity: number };
  };
}

interface AddSimpleToCartResponse {
  addSimpleProductsToCart: {
    cart: { total_quantity: number };
  };
}

// ============================================================================
// PUBLIC INPUT TYPE
// ============================================================================

export interface PlaceOrderGuestInput {
  /** Parent/simple product SKU */
  sku: string;
  /** Optional explicit variant SKU (configurable products).
   *  If omitted, the scenario queries the product to pick an in-stock variant. */
  variantSku?: string;
  /** Product type hint – skips variant fetch for 'simple' (default: 'configurable') */
  productType?: 'simple' | 'configurable';
  /** Quantity to add (default: 1) */
  quantity?: number;
  /** Full checkout details */
  checkoutData: CheckoutData;
  /** Guest email address – generated per iteration if omitted */
  guestEmail?: string;
}

// ============================================================================
// MAIN SCENARIO FUNCTION
// ============================================================================

/**
 * Execute a complete guest place-order scenario.
 *
 * @param input        - Product + checkout specification
 * @param client       - Optional pre-built GraphQL client
 * @param siteConfig   - Optional site config override
 * @returns scenario result and order number (null if failed)
 */
export function placeOrderGuestScenario(
  input: PlaceOrderGuestInput,
  client?: GraphQLClient,
  siteConfig?: SiteConfig
): { result: ScenarioResult; orderNumber: string | null } {
  const config   = siteConfig ?? getSiteConfig();
  const gqlClient = client ?? new GraphQLClient(config);

  const productType = input.productType ?? 'configurable';
  const quantity    = input.quantity ?? 1;
  const email       = input.guestEmail ?? randomEmail(`k6-${config.storeCode}.test`);

  logger.info(`Starting guest place-order on ${config.id} | SKU: ${input.sku} | email: ${email}`);

  // ── Dry-run shortcut ───────────────────────────────────────────────────────
  if (isDryRun()) {
    logger.info('DRY RUN: skipping actual place-order');
    return {
      result: { success: true, scenario: 'placeOrder', duration: 0, data: { dryRun: true } },
      orderNumber: null,
    };
  }

  const startTime = Date.now();
  let success      = false;
  let orderNumber: string | null = null;
  let errorMessage: string | undefined;

  try {
    // ── Step 1: Create guest cart ────────────────────────────────────────────
    const cartId = group('1 – Create Guest Cart', () =>
      createGuestCart(gqlClient, config.id)
    );
    if (!cartId) throw new Error('Failed to create guest cart');

    // ── Step 2: Resolve variant SKU for configurable products ────────────────
    let variantSku = input.variantSku;
    if (productType === 'configurable' && !variantSku) {
      variantSku = group('2 – Resolve Configurable Variant', () =>
        resolveInStockVariant(gqlClient, input.sku)
      ) ?? undefined;
      if (!variantSku) throw new Error(`No in-stock variant found for SKU: ${input.sku}`);
    }

    // ── Step 3: Add product to cart ──────────────────────────────────────────
    const addedToCart = group('3 – Add Product to Cart', () => {
      if (productType === 'configurable' && variantSku) {
        return addConfigurableToCart(gqlClient, cartId, input.sku, variantSku, quantity, config.id);
      }
      return addSimpleToCart(gqlClient, cartId, input.sku, quantity, config.id);
    });
    if (!addedToCart) throw new Error('Failed to add product to cart');

    // ── Step 4: Set guest email ──────────────────────────────────────────────
    const emailSet = group('4 – Set Guest Email', () =>
      setGuestEmail(gqlClient, cartId, email)
    );
    if (!emailSet) throw new Error('Failed to set guest email on cart');

    // ── Step 5: Set shipping address → get available methods ─────────────────
    const shippingMethods = group('5 – Set Shipping Address', () =>
      setShippingAddress(gqlClient, cartId, input.checkoutData.shippingAddress, config.id)
    );

    // ── Step 6: Set shipping method ──────────────────────────────────────────
    const carrierCode    = input.checkoutData.shippingCarrierCode;
    const methodCode     = input.checkoutData.shippingMethodCode;

    // Carrier codes that represent in-store / click-and-collect pickup which
    // require a Pickup Location to be separately assigned on the cart.
    // These must be skipped when auto-selecting a home-delivery shipping method.
    const PICKUP_CARRIER_CODES = ['instore', 'storepickup', 'clickandcollect', 'pickup'];

    const homeDeliveryMethod = shippingMethods?.find(m =>
      m.available &&
      !PICKUP_CARRIER_CODES.some(p => m.carrier_code.toLowerCase().includes(p))
    );

    const resolvedCarrier = carrierCode ?? homeDeliveryMethod?.carrier_code;
    const resolvedMethod  = methodCode  ?? homeDeliveryMethod?.method_code;

    if (!resolvedCarrier || !resolvedMethod) {
      throw new Error('No available shipping method returned from server');
    }

    group('6 – Set Shipping Method', () =>
      setShippingMethod(gqlClient, cartId, resolvedCarrier, resolvedMethod, config.id)
    );

    // ── Step 7: Set billing address ──────────────────────────────────────────
    const billingAddr = input.checkoutData.billingAddress ?? input.checkoutData.shippingAddress;
    group('7 – Set Billing Address', () =>
      setBillingAddress(gqlClient, cartId, billingAddr, config.id)
    );

    // ── Step 8: Set payment method ───────────────────────────────────────────
    const paymentCode = input.checkoutData.paymentMethodCode;
    group('8 – Set Payment Method', () =>
      setPaymentMethod(gqlClient, cartId, paymentCode, config.id)
    );

    // ── Step 9: Place order ──────────────────────────────────────────────────
    orderNumber = group('9 – Place Order', () =>
      executePlaceOrder(gqlClient, cartId, config.id)
    );
    if (!orderNumber) throw new Error('placeOrder mutation returned no order number');

    success = true;
    logger.info(`Order placed successfully: ${orderNumber}`);

  } catch (error) {
    success      = false;
    errorMessage = (error as Error).message;
    logger.error(`Place-order guest scenario failed: ${errorMessage}`);
  }

  const duration = Date.now() - startTime;

  // Record aggregate scenario metrics
  recordScenarioMetrics('placeOrder', duration, success, { site: config.id });
  placeOrderSuccessRate.add(success ? 1 : 0, { site: config.id });
  ordersTotal.add(1, { site: config.id });

  const result: ScenarioResult = {
    success,
    scenario: 'placeOrder',
    duration,
    error: errorMessage,
    data: {
      site:        config.id,
      sku:         input.sku,
      variantSku:  input.variantSku,
      email,
      orderNumber,
    },
  };

  logger.info(`Guest place-order ${success ? 'SUCCEEDED' : 'FAILED'} in ${duration}ms`, {
    orderNumber,
    site: config.id,
  });

  return { result, orderNumber };
}

// ============================================================================
// STEP HELPERS
// ============================================================================

/** Create a guest (masked) cart and return its ID */
function createGuestCart(client: GraphQLClient, siteId: string): string | null {
  const { result: response, duration } = measureTime(() =>
    client.mutate<CreateGuestCartResponse>(CREATE_GUEST_CART, {}, {
      tags: { operation: 'createGuestCart', site: siteId },
    })
  );
  guestCartCreateTime.add(duration, { site: siteId });

  const ok = checkGraphQLResponse(response);
  guestCartSuccess.add(ok ? 1 : 0, { site: siteId });

  if (!ok) {
    logger.error(`createGuestCart failed: ${response.errors?.[0]?.message ?? 'unknown'}`);
    return null;
  }

  const cartId = response.data?.createEmptyCart ?? null;

  check(cartId, { 'Guest cart ID is non-empty': (id) => !!id && id.length > 0 });

  if (cartId) logger.debug(`Guest cart created: ${cartId}`);
  return cartId;
}

/**
 * Query the configurable product and return the first in-stock child SKU.
 * Falls back to first variant if none are explicitly IN_STOCK.
 */
function resolveInStockVariant(client: GraphQLClient, parentSku: string): string | null {
  const response = client.query<ConfigurableProductVariantsResponse>(
    GET_CONFIGURABLE_PRODUCT_VARIANTS,
    { sku: parentSku },
    { tags: { operation: 'getConfigurableVariants' } }
  );

  if (!checkGraphQLResponse(response)) {
    logger.error(`Failed to fetch variants for SKU ${parentSku}`);
    return null;
  }

  const product = response.data?.products?.items?.[0];
  if (!product) {
    logger.warn(`Product ${parentSku} not found on this store`);
    return null;
  }

  const variants = product.variants ?? [];
  const inStock   = variants.filter(v => v.product.stock_status === 'IN_STOCK');

  if (inStock.length > 0) {
    const chosen = randomItem(inStock) as typeof inStock[0];
    logger.debug(`Resolved in-stock variant: ${chosen.product.sku} (parent: ${parentSku})`);
    return chosen.product.sku;
  }

  // No IN_STOCK variant found – do NOT fall back to avoid "unavailable" errors
  logger.warn(`No IN_STOCK variant found for ${parentSku} – skipping this product`);
  return null;
}

/** Add a configurable product + variant to the cart */
function addConfigurableToCart(
  client: GraphQLClient,
  cartId: string,
  parentSku: string,
  variantSku: string,
  qty: number,
  siteId: string
): boolean {
  const { result: response, duration } = measureTime(() =>
    client.mutate<AddConfigurableToCartResponse>(ADD_CONFIGURABLE_TO_CART, {
      cartId, parentSku, variantSku, qty,
    }, { tags: { operation: 'addConfigurableProductsToCart', site: siteId } })
  );
  addToCartTime.add(duration, { site: siteId });

  const ok = checkGraphQLResponse(response);
  addToCartSuccess.add(ok ? 1 : 0, { site: siteId });

  if (!ok) {
    logger.error(`addConfigurableProductsToCart failed: ${response.errors?.[0]?.message ?? 'unknown'}`);
    return false;
  }

  const totalQty = response.data?.addConfigurableProductsToCart?.cart?.total_quantity ?? 0;
  check(totalQty, { 'Cart has items after add': (q) => q > 0 });

  logger.debug(`Added configurable product to cart | parent: ${parentSku} variant: ${variantSku} qty: ${qty}`);
  return totalQty > 0;
}

/** Add a simple product to the cart */
function addSimpleToCart(
  client: GraphQLClient,
  cartId: string,
  sku: string,
  qty: number,
  siteId: string
): boolean {
  const { result: response, duration } = measureTime(() =>
    client.mutate<AddSimpleToCartResponse>(ADD_SIMPLE_TO_CART, { cartId, sku, qty }, {
      tags: { operation: 'addSimpleProductsToCart', site: siteId },
    })
  );
  addToCartTime.add(duration, { site: siteId });

  const ok = checkGraphQLResponse(response);
  addToCartSuccess.add(ok ? 1 : 0, { site: siteId });

  if (!ok) {
    logger.error(`addSimpleProductsToCart failed: ${response.errors?.[0]?.message ?? 'unknown'}`);
    return false;
  }

  const totalQty = response.data?.addSimpleProductsToCart?.cart?.total_quantity ?? 0;
  check(totalQty, { 'Cart has items after add': (q) => q > 0 });

  logger.debug(`Added simple product to cart | sku: ${sku} qty: ${qty}`);
  return totalQty > 0;
}

/** Set guest email on the cart. Returns false if the mutation fails. */
function setGuestEmail(client: GraphQLClient, cartId: string, email: string): boolean {
  const response = client.mutate(
    SET_GUEST_EMAIL,
    { cartId, email },
    { tags: { operation: 'setGuestEmailOnCart' } }
  );

  if (!checkGraphQLResponse(response)) {
    logger.error(`setGuestEmailOnCart failed: ${response.errors?.[0]?.message ?? 'unknown'}`);
    return false;
  }

  logger.debug(`Guest email set: ${email}`);
  return true;
}

/**
 * Set the shipping address and return the list of available shipping methods.
 * Returns null if the mutation fails.
 */
function setShippingAddress(
  client: GraphQLClient,
  cartId: string,
  address: AddressInput,
  siteId: string
): ShippingMethod[] | null {
  const cartAddress = toCartAddressInput(address);

  const { result: response, duration } = measureTime(() =>
    client.mutate<SetShippingAddressResponse>(
      SET_SHIPPING_ADDRESS,
      { cartId, address: cartAddress },
      { tags: { operation: 'setShippingAddressesOnCart', site: siteId } }
    )
  );
  setShippingAddrTime.add(duration, { site: siteId });

  if (!checkGraphQLResponse(response)) {
    logger.error(`setShippingAddressesOnCart failed: ${response.errors?.[0]?.message ?? 'unknown'}`);
    return null;
  }

  const shippingAddresses = response.data?.setShippingAddressesOnCart?.cart?.shipping_addresses ?? [];
  const methods           = shippingAddresses[0]?.available_shipping_methods ?? [];

  check(methods, {
    'At least one shipping method available': (m) => m.length > 0,
  });

  const available = methods.filter(m => m.available);
  logger.debug(`Available shipping methods: ${available.map(m => `${m.carrier_code}_${m.method_code}`).join(', ')}`);
  return available;
}

/** Set shipping method on the cart */
function setShippingMethod(
  client: GraphQLClient,
  cartId: string,
  carrierCode: string,
  methodCode: string,
  siteId: string
): boolean {
  const { result: response, duration } = measureTime(() =>
    client.mutate<SetShippingMethodResponse>(
      SET_SHIPPING_METHOD,
      { cartId, carrierCode, methodCode },
      { tags: { operation: 'setShippingMethodsOnCart', site: siteId } }
    )
  );
  setShippingMethTime.add(duration, { site: siteId });

  if (!checkGraphQLResponse(response)) {
    logger.error(`setShippingMethodsOnCart failed: ${response.errors?.[0]?.message ?? 'unknown'}`);
    return false;
  }

  const grandTotal = response.data?.setShippingMethodsOnCart?.cart?.prices?.grand_total;
  check(grandTotal, { 'Grand total is set after shipping method': (t) => !!t && t.value > 0 });

  logger.debug(`Shipping method set: ${carrierCode}/${methodCode} | grand total: ${grandTotal?.value} ${grandTotal?.currency}`);
  return true;
}

/** Set billing address on the cart */
function setBillingAddress(
  client: GraphQLClient,
  cartId: string,
  address: AddressInput,
  siteId: string
): void {
  const cartAddress = toCartAddressInput(address);

  const { result: response, duration } = measureTime(() =>
    client.mutate(
      SET_BILLING_ADDRESS,
      { cartId, address: cartAddress },
      { tags: { operation: 'setBillingAddressOnCart', site: siteId } }
    )
  );
  setBillingAddrTime.add(duration, { site: siteId });

  if (!checkGraphQLResponse(response)) {
    logger.warn(`setBillingAddressOnCart failed: ${response.errors?.[0]?.message ?? 'unknown'}`);
  } else {
    logger.debug('Billing address set');
  }
}

/** Set payment method on the cart */
function setPaymentMethod(
  client: GraphQLClient,
  cartId: string,
  paymentCode: string,
  siteId: string
): boolean {
  const { result: response, duration } = measureTime(() =>
    client.mutate<SetPaymentMethodResponse>(
      SET_PAYMENT_METHOD,
      { cartId, paymentCode },
      { tags: { operation: 'setPaymentMethodOnCart', site: siteId } }
    )
  );
  setPaymentMethTime.add(duration, { site: siteId });

  if (!checkGraphQLResponse(response)) {
    logger.error(`setPaymentMethodOnCart failed: ${response.errors?.[0]?.message ?? 'unknown'}`);
    return false;
  }

  const selected = response.data?.setPaymentMethodOnCart?.cart?.selected_payment_method;
  check(selected, { 'Payment method selected': (p) => !!p?.code });

  const grandTotal = response.data?.setPaymentMethodOnCart?.cart?.prices?.grand_total;
  logger.debug(`Payment method set: ${selected?.code} | grand total: ${grandTotal?.value} ${grandTotal?.currency}`);
  return !!selected?.code;
}

/** Execute the placeOrder mutation and return the order number */
function executePlaceOrder(
  client: GraphQLClient,
  cartId: string,
  siteId: string
): string | null {
  const { result: response, duration } = measureTime(() =>
    client.mutate<PlaceOrderResponse>(
      PLACE_ORDER,
      { cartId },
      { tags: { operation: 'placeOrder', site: siteId } }
    )
  );
  placeOrderTime.add(duration, { site: siteId });

  if (!checkGraphQLResponse(response)) {
    logger.error(`placeOrder mutation failed: ${response.errors?.[0]?.message ?? 'unknown'}`);
    return null;
  }

  const orderNum = response.data?.placeOrder?.order?.order_number ?? null;
  check(orderNum, { 'Order number returned': (n) => !!n && n.length > 0 });

  return orderNum;
}

// ============================================================================
// UTILITY HELPERS
// ============================================================================

/**
 * Convert an AddressInput (used in CheckoutData) to the CartAddressInput
 * shape expected by the Magento 2 setShippingAddressesOnCart mutation.
 *
 * We intentionally omit region_id and use the region string only –
 * region_id values are store-specific and often differ between installations.
 */
function toCartAddressInput(addr: AddressInput): Record<string, unknown> {
  return {
    firstname:    addr.firstname,
    lastname:     addr.lastname,
    street:       addr.street,
    city:         addr.city,
    // Pass region as a plain string; Magento resolves the ID internally.
    // Never pass region_id as it is store-specific and causes validation errors.
    region:       addr.region,
    postcode:     addr.postcode,
    country_code: addr.country_code,
    telephone:    addr.telephone,
    company:      addr.company,
    save_in_address_book: false,
  };
}
