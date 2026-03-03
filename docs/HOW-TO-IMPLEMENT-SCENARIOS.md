# How to Implement Test Scenarios

**Document type:** How-to Guide  
**Target audience:** Developers who are familiar with TypeScript and want to wire up load-test scenarios inside the k6 eCommerce framework.  
**Goal:** Walk through every practical step required to implement the three built-in scenarios — PDP, PLP, and Place Order — inside a test file, so each scenario is correctly configured, data-loaded, metricked, and executable with `k6 run`.

---

## Prerequisites

Before following any of the steps below, make sure you have:

- Node.js ≥ 18 and k6 ≥ 0.52 installed.
- The repository dependencies installed (`npm install`).
- A compiled bundle ready (`npm run build` or `npx webpack`).
- A target environment's config set up in `src/config/environments/` (e.g., `staging.json`).
- Test data files present in `src/data/` (see [Test Data Requirements](#test-data-requirements) for each scenario).

> **Note:** The Place Order scenario creates real orders on the configured store. Run it against a staging environment only unless `PRODUCTION_CONFIRMED=true` and `ENABLE_PLACE_ORDER=true` are set explicitly.

---

## Overview of the Three Scenarios

| Scenario | File | Exported function | Data input | Typical duration |
|---|---|---|---|---|
| Product Detail Page (PDP) | `src/scenarios/pdp.ts` | `pdpScenario()` | Product SKU or URL key | ~1–2 s |
| Product Listing Page (PLP) | `src/scenarios/plp.ts` | `plpScenario()` | Category URL path | ~1–3 s |
| Place Order (Guest Checkout) | `src/scenarios/place-order.ts` | `placeOrderScenario()` | Product SKU + delivery address | ~5–10 s |

Each scenario function:
- Accepts an optional pre-built `GraphQLClient` and `SiteConfig` override.
- Respects `isDryRun()` — returns a success stub when `DRY_RUN=true`.
- Records its own custom k6 `Trend` / `Rate` / `Counter` metrics automatically.
- Returns a `ScenarioResult` object with `success`, `duration`, and `data` fields.

---

## Step 1 — Create the Test File

Create a new TypeScript test file under `src/tests/`. A single file can orchestrate multiple scenarios. Scaffold it with the mandatory k6 exports:

```typescript
// src/tests/my-test.ts
import { Options } from 'k6/options';
import exec from 'k6/execution';
// @ts-expect-error - k6 remote module
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

import { GraphQLClient } from '@lib/graphql-client';
import { createLogger } from '@lib/logger';
import { thinkTime } from '@lib/utils';
import { getSiteConfig } from '@config';

const logger = createLogger('MyTest');

// k6 will call this once per VU per iteration
export default function () {
  // scenario calls go here (Steps 3–5)
}
```

> `export const options` and `export default function` are the two lifecycle hooks k6 requires. Everything else is optional.

---

## Step 2 — Define Options and Thresholds

Add an `options` export directly above the default function. Adjust the stages and thresholds to match your test goal.

```typescript
import { Options } from 'k6/options';
import { customThresholds } from '@lib/metrics';

export const options: Options = {
  stages: [
    { duration: '1m', target: 20 },  // ramp-up
    { duration: '3m', target: 20 },  // steady state
    { duration: '1m', target: 0 },   // ramp-down
  ],
  thresholds: {
    // Generic HTTP thresholds
    'http_req_duration': ['p(95)<1000', 'p(99)<3000'],
    'http_req_failed':   ['rate<0.01'],

    // Scenario-specific thresholds (sourced from the shared registry)
    'scenario_pdp_success':          customThresholds['scenario_pdp_success'],
    'scenario_pdp_duration':         customThresholds['scenario_pdp_duration'],
    'scenario_plp_success':          customThresholds['scenario_plp_success'],
    'scenario_plp_duration':         customThresholds['scenario_plp_duration'],
    'place_order_success':           ['rate>0.90'],
    'place_order_mutation_time':     ['p(95)<8000'],
  },
  tags: { testType: 'load' },
};
```

`customThresholds` from `@lib/metrics` exposes the recommended pass/fail bars for every built-in scenario. You can override individual values as shown for `place_order_*`.

---

## Step 3 — Implement the PDP Scenario

### 3.1 — Prepare Test Data

The PDP scenario requires a list of product SKUs (or URL keys). Add them as a constant, or load them via `SharedArray` from `src/data/`.

```typescript
import { SharedArray } from 'k6/data';
import { TestProduct } from '@types';

// Option A — inline array (simple)
const PRODUCTS: TestProduct[] = [
  { id: '1', sku: 'ADYS400073-062.BLK', productType: 'configurable' },
  { id: '2', sku: '26422322.PNK',        productType: 'configurable' },
];

// Option B — load from the data file (memory-efficient for large sets)
const PRODUCTS = new SharedArray<TestProduct>('products', () => {
  return JSON.parse(open('../data/products-platypus-au.json')).products;
});
```

`SharedArray` is initialised once and shared across all VUs — use it when the product list is large.

### 3.2 — Import and Call the Scenario

```typescript
import { pdpScenario } from '@scenarios/pdp';

export default function () {
  const config  = getSiteConfig();
  const client  = new GraphQLClient(config);
  const product = randomItem(PRODUCTS) as TestProduct;

  const { result } = pdpScenario(
    { sku: product.sku },  // ProductData — pass sku OR urlKey
    client,                // optional: reuse a single client per VU
    config                 // optional: override site config
  );

  if (!result.success) {
    logger.warn(`PDP failed for SKU: ${product.sku}`, { error: result.error });
  }

  thinkTime(1, 3); // random pause between 1–3 seconds
}
```

### 3.3 — What the Scenario Does Internally

| Step | GraphQL operation | k6 Metric recorded |
|---|---|---|
| Query by SKU | `products(filter: { sku: { eq: $sku } })` | `pdp_product_query_time` |
| Validate product fields | `check()` on name, stock, price | `pdp_product_found`, `pdp_product_in_stock` |
| (Configurable only) Validate options | `check()` on `configurable_options` | — |

---

## Step 4 — Implement the PLP Scenario

### 4.1 — Prepare Category Data

The PLP scenario requires a list of category URL paths — the path segment after the store domain (e.g., `mens/footwear`).

```typescript
import { CategoryData } from '@types';

const CATEGORIES: CategoryData[] = [
  { urlPath: 'mens/footwear' },
  { urlPath: 'womens/sneakers' },
  { urlPath: 'kids/shoes',  pageSize: 12 },   // optional: override page size
  { urlPath: 'sale',         currentPage: 2 }, // optional: start on page 2
];
```

`pageSize` defaults to `24` and `currentPage` defaults to `1` if not provided.

### 4.2 — Import and Call the Scenario

```typescript
import { plpScenario } from '@scenarios/plp';

export default function () {
  const config   = getSiteConfig();
  const client   = new GraphQLClient(config);
  const category = randomItem(CATEGORIES) as CategoryData;

  const { result, productCount } = plpScenario(
    category,
    client,
    config
  );

  if (!result.success) {
    logger.warn(`PLP failed for path: ${category.urlPath}`, { error: result.error });
  } else {
    logger.debug(`PLP loaded ${productCount} products`);
  }

  thinkTime(2, 4);
}
```

### 4.3 — What the Scenario Does Internally

| Step | GraphQL operation | k6 Metric recorded |
|---|---|---|
| Resolve category URL | `categoryList(filters: { url_path: { eq: $urlPath } })` | `plp_category_query_time`, `plp_category_found` |
| Fetch products | `products(filter: { category_uid: { eq: $uid } }, pageSize, currentPage, sort)` | `plp_products_query_time`, `plp_products_returned`, `plp_total_product_count`, `plp_page_views` |

If the category URL does not resolve, the scenario records a failure and returns early without loading products — this correctly mirrors a real 404 page view.

---

## Step 5 — Implement the Place Order (Guest Checkout) Scenario

> **Warning:** This scenario submits real `placeOrder` mutations. Always confirm you are pointed at a staging environment before running.

### 5.1 — Prepare Checkout Data

The scenario requires a product (SKU + type) and a delivery address. Load them from the shared data files:

```typescript
import { SharedArray } from 'k6/data';
import { CheckoutData, TestProduct, AddressInput } from '@types';

const PRODUCTS = new SharedArray<TestProduct>('checkout-products', () =>
  JSON.parse(open('../data/products-platypus-au.json')).products
);

const ADDRESSES = new SharedArray<AddressInput>('addresses', () =>
  JSON.parse(open('../data/addresses.json')).addresses
);
```

Alternatively, construct a `CheckoutData` object inline:

```typescript
const checkoutData: CheckoutData = {
  product: {
    id: '1',
    sku: 'ADYS400073-062.BLK',
    productType: 'configurable',
  },
  address: {
    firstname:    'Test',
    lastname:     'User',
    street:       ['123 Test Street'],
    city:         'Sydney',
    region:       'NSW',
    postcode:     '2000',
    country_code: 'AU',
    telephone:    '0400000000',
  },
};
```

### 5.2 — Import and Call the Scenario

```typescript
import { placeOrderScenario } from '@scenarios/place-order';

export default function () {
  const config  = getSiteConfig();
  const client  = new GraphQLClient(config);
  const product = randomItem(PRODUCTS) as TestProduct;
  const address = randomItem(ADDRESSES) as AddressInput;

  const { result } = placeOrderScenario(
    { product, address },
    client,
    config
  );

  if (!result.success) {
    logger.error('Place order failed', { error: result.error });
  } else {
    logger.info(`Order placed: ${result.data?.orderNumber}`);
  }

  thinkTime(3, 5);
}
```

### 5.3 — What the Scenario Does Internally

The Place Order scenario executes a nine-step guest checkout pipeline. Each step is wrapped in a k6 `group()` and records its own `Trend` metric:

| Step | GraphQL operation | k6 Metric |
|---|---|---|
| 1 | `createEmptyCart` → returns masked cart ID | `place_order_guest_cart_create_time` |
| 2 | `products(filter: { sku })` → resolve configurable variants | _(uses PDP query internally)_ |
| 3 | `addConfigurableProductsToCart` or `addSimpleProductsToCart` | `place_order_add_to_cart_time` |
| 4 | `setGuestEmailOnCart` | _(no dedicated trend; warns on failure)_ |
| 5 | `setShippingAddressesOnCart` → returns available methods | `place_order_set_shipping_addr_time` |
| 6 | `setShippingMethodsOnCart` → first available method | `place_order_set_shipping_meth_time` |
| 7 | `setBillingAddressOnCart` | `place_order_set_billing_addr_time` |
| 8 | `setPaymentMethodOnCart` | `place_order_set_payment_meth_time` |
| 9 | `placeOrder` → returns `order_number` | `place_order_mutation_time`, `place_order_success`, `place_order_total_orders` |

If any step fails, the scenario aborts the remaining steps and records `success: false`.

### 5.4 — Environment Guards

The scenario checks two environment variables before sending the `placeOrder` mutation:

| Variable | Purpose | Required value |
|---|---|---|
| `PRODUCTION_CONFIRMED` | Confirm intent to run against production | `"true"` |
| `ENABLE_PLACE_ORDER` | Opt-in flag for the place order mutation | `"true"` |

On staging, neither variable is needed. On production, both must be set, or the scenario will abort at step 9 and log a warning instead of placing the order.

---

## Step 6 — Combine Multiple Scenarios

To chain all three scenarios in a single test iteration (simulating a realistic user journey: browse list → view product → purchase), compose each call sequentially:

```typescript
export default function () {
  const config  = getSiteConfig();
  const client  = new GraphQLClient(config);  // reuse connection across scenarios

  // 1. Browse a category
  const category = randomItem(CATEGORIES) as CategoryData;
  const { result: plpResult, productCount } = plpScenario(category, client, config);
  thinkTime(1, 2);

  if (!plpResult.success || productCount === 0) return;

  // 2. View a product detail page
  const product = randomItem(PRODUCTS) as TestProduct;
  const { result: pdpResult } = pdpScenario({ sku: product.sku }, client, config);
  thinkTime(2, 4);

  if (!pdpResult.success) return;

  // 3. Place an order (only a percentage of VUs, to reflect real conversion rate)
  if (exec.vu.idInTest % 10 === 0) {          // ~10 % of VUs place an order
    const address = randomItem(ADDRESSES) as AddressInput;
    placeOrderScenario({ product, address }, client, config);
    thinkTime(3, 5);
  }
}
```

---

## Step 7 — Build and Run

```bash
# Compile TypeScript to dist/
npm run build

# Run against the default site (reads SITE env var, falls back to first config)
k6 run dist/tests/my-test.js

# Target a specific site
k6 run --env SITE=platypus-au dist/tests/my-test.js

# Dry-run (no HTTP calls made)
k6 run --env DRY_RUN=true dist/tests/my-test.js

# Use the k6 web dashboard for live metrics
k6 run --out dashboard dist/tests/my-test.js
```

---

## Test Data Requirements

### PDP

| Field | Source file | Required |
|---|---|---|
| `sku` | `src/data/products-*.json` | Yes (or `urlKey`) |
| `urlKey` | `src/data/products-*.json` | Yes (or `sku`) |

### PLP

| Field | Source | Required |
|---|---|---|
| `urlPath` | Discovered from the storefront (see `discover-products.js`) | Yes |
| `pageSize` | Optional — defaults to `24` | No |
| `currentPage` | Optional — defaults to `1` | No |

### Place Order

| Field | Source file | Required |
|---|---|---|
| `product.sku` | `src/data/products-*.json` | Yes |
| `product.productType` | `src/data/products-*.json` | Yes (`'simple'` or `'configurable'`) |
| `address.*` | `src/data/addresses.json` | Yes (all fields listed in §5.1) |

---

## Troubleshooting

**`Product not found` errors on PDP**  
Verify that the SKUs in your test data exist and are published on the target store. Run `node discover-products.js` to refresh the product lists from a live site.

**`Category not found` on PLP**  
Category URL paths are store-specific. Confirm the path segment against the live storefront URL (e.g., `https://store.example.com/mens/footwear` → `urlPath: 'mens/footwear'`).

**`setShippingAddressesOnCart` fails with a region error**  
Do not pass `region_id` in the address object; it is store-specific. Pass the region as a plain string (e.g., `"NSW"`). The framework's `toCartAddressInput()` helper omits `region_id` automatically.

**Place order aborts at step 9 with "production guard active"**  
You are running against a production environment. Set `ENABLE_PLACE_ORDER=true` and `PRODUCTION_CONFIRMED=true`, or switch the `SITE` variable to a staging target.

**GraphQL response errors**  
Enable debug logging to see full request/response pairs:

```bash
k6 run --env LOG_LEVEL=debug dist/tests/my-test.js
```
