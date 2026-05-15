# k6 eCommerce Load Testing Framework

TypeScript/k6 load testing framework for Magento 2 / Adobe Commerce GraphQL APIs.
Targets **8 sites** across **2 environments** (staging + production): Platypus, Skechers, Dr Martens, Vans — AU and NZ variants.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Overview](#project-overview)
3. [Installation](#installation)
4. [Project Structure](#project-structure)
5. [Running Tests](#running-tests)
6. [Environment Variables](#environment-variables)
7. [Site Reference](#site-reference)
8. [Test Files](#test-files)
9. [Architecture](#architecture)
10. [Product Data Management](#product-data-management)
11. [Custom Metrics Reference](#custom-metrics-reference)
12. [Adding a New Scenario](#adding-a-new-scenario)
13. [Production Safety](#production-safety)
14. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Install dependencies and build
npm install
npm run build

# 2. Quick smoke (30s, 2 VUs, platypus-au staging)
npm run test:quick

# 3. Full PDP load test — platypus-au staging
npm run test:load:platypus-au

# 4. Vans guest checkout
k6 run -e SITE=vans-au -e ENABLE_PLACE_ORDER=true dist/tests/place-order.test.js
```

> **Always `npm run build` before running tests.** k6 runs the bundled `dist/` files, not the TypeScript sources.

---

## Project Overview

### What this framework tests

| Test file | Scenario | Sites |
|---|---|---|
| `tests/pdp-load.test.js` | PDP (Product Detail Page) GraphQL query | All 8 |
| `tests/plp-load.test.js` | PLP (Product Listing Page) category query | All 8 |
| `tests/place-order.test.js` | Full 9-step guest checkout end-to-end | All 8 sites |

### Target sites

| Site ID | Brand | Country | Currency |
|---|---|---|---|
| `platypus-au` | Platypus Shoes | AU | AUD |
| `platypus-nz` | Platypus Shoes | NZ | NZD |
| `skechers-au` | Skechers | AU | AUD |
| `skechers-nz` | Skechers | NZ | NZD |
| `drmartens-au` | Dr Martens | AU | AUD |
| `drmartens-nz` | Dr Martens | NZ | NZD |
| `vans-au` | Vans | AU | AUD |
| `vans-nz` | Vans | NZ | NZD |

### Load profile

All tests use a `ramping-arrival-rate` executor to guarantee a constant throughput target regardless of server response time. The default profile:

```
 req/min
 500 │              ┌────────┐
 200 │    ┌────────┐│        │
   0 ├────┘        └┘        └────
     0   2m  7m  9m  14m  16m
```

- 200 req/min sustained average load
- 500 req/min peak load
- Total duration: ~16 minutes (full run)

---

## Installation

### Prerequisites

- **Node.js 18+**
- **k6 v0.49+**

```bash
# Windows (winget)
winget install k6

# Windows (Chocolatey)
choco install k6

# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### Setup

```bash
git clone <repo-url>
cd k6-ecommerce-framework
npm install
npm run build
```

### Docker (no local k6 required)

```bash
npm install && npm run build

# PowerShell quick smoke
docker run --rm -v "${PWD}:/app" -e SITE=platypus-au grafana/k6 run \
  -e QUICK_TEST=true /app/dist/tests/pdp-load.test.js

# bash/zsh
docker run --rm -v "$(pwd):/app" -e SITE=platypus-au grafana/k6 run \
  -e QUICK_TEST=true /app/dist/tests/pdp-load.test.js
```

---

## Project Structure

```
k6-ecommerce-framework/
├── src/
│   ├── config/
│   │   ├── config-manager.ts          # ConfigManager singleton — all site & env config
│   │   ├── index.ts                   # Re-exports: getSiteConfig, getEnvironmentConfig, ...
│   │   └── environments/
│   │       ├── staging.json           # Staging timeouts, thresholds, think-time
│   │       └── production.json        # Production — stricter thresholds, features off
│   ├── data/
│   │   ├── products-platypus.json     # Platypus AU+NZ product SKUs
│   │   ├── products-skechers.json     # Skechers AU+NZ product SKUs
│   │   ├── products-vans-au.json      # Vans AU product SKUs
│   │   ├── products-vans-nz.json      # Vans NZ product SKUs (country-specific pool)
│   │   ├── products-drmartens.json    # Dr Martens — PLACEHOLDER, discovery needed
│   │   ├── categories-*.json          # Category URL paths per brand (used by plp-load)
│   │   ├── addresses.json             # AU shipping addresses (10 entries)
│   │   ├── addresses-nz.json          # NZ shipping addresses (8 entries)
│   │   └── users.json / users.csv     # Test customer credentials
│   ├── lib/
│   │   ├── graphql-client.ts          # HTTP client — retry, backoff, metrics tagging
│   │   ├── data-provider.ts           # SharedArray wrappers, DataProvider class
│   │   ├── metrics.ts                 # All custom k6 metrics + threshold definitions
│   │   ├── auth-manager.ts            # Customer token management
│   │   ├── logger.ts                  # Structured logger (level, VU context, timestamps)
│   │   ├── utils.ts                   # thinkTime, randomEmail, measureTime, ...
│   │   └── index.ts
│   ├── scenarios/
│   │   ├── pdp.ts                     # Product detail page GraphQL query
│   │   ├── plp.ts                     # Category listing GraphQL query
│   │   ├── place-order.ts             # 9-step guest checkout flow
│   │   ├── login.ts                   # Customer token authentication
│   │   └── index.ts
│   ├── tests/
│   │   ├── pdp-load.test.ts           # PDP load test — all 8 sites
│   │   ├── plp-load.test.ts           # PLP load test — all 8 sites
│   │   └── place-order.test.ts   # Guest checkout — all 8 sites
│   └── types/
│       └── index.ts                   # All TypeScript interfaces
├── dist/                              # Webpack output — what k6 actually runs
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SCENARIOS.md
│   ├── DEPLOYMENT.md
│   └── HOW-TO-IMPLEMENT-SCENARIOS.md
├── webpack.config.js                  # One bundle per test file in src/tests/
├── tsconfig.json
└── package.json
```

---

## Running Tests

### Build first

```bash
npm run build          # Production webpack bundle → dist/
npm run build:watch    # Watch mode for development
npm run validate       # TypeScript type-check only (no emit)
npm run lint           # ESLint
```

### Quick / smoke

```bash
# 30-second smoke — 5 req/min, 2 VUs max (QUICK_TEST mode)
npm run test:quick

# Any site
k6 run -e SITE=skechers-au -e ENVIRONMENT=staging -e QUICK_TEST=true dist/tests/pdp-load.test.js
```

`QUICK_TEST=true` swaps the 16-minute arrival-rate profile for a `constant-arrival-rate` that runs for 30 seconds at 5 req/min. Use it to verify connectivity and data before committing to a full run.

### PDP load test

```bash
# Defaults: platypus-au, staging
npm run test:load

# Per-site staging shortcuts
npm run test:load:platypus-au
npm run test:load:platypus-nz
npm run test:load:skechers-au
npm run test:load:skechers-nz
npm run test:load:vans-au
npm run test:load:vans-nz
npm run test:load:drmartens-au   # ⚠️ will fail-fast (placeholder SKUs)
npm run test:load:drmartens-nz   # ⚠️ will fail-fast (placeholder SKUs)

# Per-site production (requires PRODUCTION_CONFIRMED)
npm run test:load:platypus-au:prod
npm run test:load:skechers-au:prod
# ... etc. — same pattern for all sites

# Custom
k6 run -e SITE=platypus-nz -e ENVIRONMENT=staging dist/tests/pdp-load.test.js
```

> **Note:** The npm scripts include `--vus` and `--duration` flags. These are **silently ignored** by k6 when `scenarios` is defined in the test file. The execution profile is fully controlled by the `scenarios` block. See [Troubleshooting](#--vus-and---duration-flags-have-no-effect).

### PLP load test

```bash
k6 run -e SITE=platypus-au -e ENVIRONMENT=staging dist/tests/plp-load.test.js
k6 run -e SITE=vans-nz     -e ENVIRONMENT=staging dist/tests/plp-load.test.js
```

### Guest checkout (all sites)

```bash
# Any site — staging
k6 run -e SITE=platypus-au -e ENABLE_PLACE_ORDER=true dist/tests/place-order.test.js
k6 run -e SITE=skechers-nz -e ENABLE_PLACE_ORDER=true dist/tests/place-order.test.js
k6 run -e SITE=drmartens-au -e ENABLE_PLACE_ORDER=true dist/tests/place-order.test.js
k6 run -e SITE=vans-nz -e ENABLE_PLACE_ORDER=true dist/tests/place-order.test.js

# Dry checkout (no actual orders placed)
k6 run -e SITE=platypus-au -e DRY_RUN=true dist/tests/place-order.test.js

# Custom payment method
k6 run -e SITE=vans-au -e ENABLE_PLACE_ORDER=true -e PAYMENT_METHOD=free dist/tests/place-order.test.js
```

### Web dashboard (real-time)

```bash
# Opens at http://localhost:5665
npm run dashboard

# Per-site with dashboard
k6 run --out web-dashboard -e SITE=platypus-au dist/tests/pdp-load.test.js
```

### Dry run

```bash
npm run dry-run
# Sets DRY_RUN=true — mutations are no-ops, GraphQL queries still run.
# The full arrival-rate profile still executes.
# Use test:quick instead for a short functional check with real API calls.
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SITE` | `platypus-au` | Target site ID (see [Site Reference](#site-reference)) |
| `ENVIRONMENT` | `staging` | `staging` or `production` |
| `QUICK_TEST` | `false` | `true` → 30s smoke profile (5 req/min, 2 VUs) in pdp-load.test |
| `DRY_RUN` | `false` | Skip mutations; GraphQL queries still run |
| `ENABLE_PLACE_ORDER` | `false` | Must be `true` for place-order to place orders |
| `PRODUCTION_CONFIRMED` | `false` | Required to run order mutations against production |
| `PAYMENT_METHOD` | `checkmo` | Magento payment method code for place-order |
| `DEBUG` | `false` | Verbose client-level logging |
| `BASE_URL` | _(site default)_ | Override the base URL for the selected site |
| `GRAPHQL_ENDPOINT` | _(site default)_ | Override the GraphQL endpoint directly |
| `TIMEOUT` | `30000` | HTTP request timeout in milliseconds |
| `THINK_TIME_MIN` | _(env default)_ | Minimum think time in seconds |
| `THINK_TIME_MAX` | _(env default)_ | Maximum think time in seconds |

### Think time defaults by environment

| Environment | Min | Max |
|---|---|---|
| staging | 1s | 3s |
| production | 3s | 8s |

---

## Site Reference

### Staging endpoints

| Site ID | GraphQL endpoint |
|---|---|
| `platypus-au` | `https://stag-platypus-au.accentgra.com/graphql` |
| `platypus-nz` | `https://stag-platypus-nz.accentgra.com/graphql` |
| `skechers-au` | `https://stag-skechers-au.accentgra.com/graphql` |
| `skechers-nz` | `https://stag-skechers-nz.accentgra.com/graphql` |
| `drmartens-au` | `https://stag-drmartens-au.accentgra.com/graphql` |
| `drmartens-nz` | `https://stag-drmartens-nz.accentgra.com/graphql` |
| `vans-au` | `https://stag-vans-au.accentgra.com/graphql` |
| `vans-nz` | `https://stag-vans-nz.accentgra.com/graphql` |

### Production endpoints

| Site ID | GraphQL endpoint |
|---|---|
| `platypus-au` | `https://www.platypusshoes.com.au/graphql` |
| `platypus-nz` | `https://www.platypusshoes.co.nz/graphql` |
| `skechers-au` | `https://www.skechers.com.au/graphql` |
| `skechers-nz` | `https://www.skechers.co.nz/graphql` |
| `drmartens-au` | `https://www.drmartens.com.au/graphql` |
| `drmartens-nz` | `https://www.drmartens.co.nz/graphql` |
| `vans-au` | `https://www.vans.com.au/graphql` |
| `vans-nz` | `https://www.vans.co.nz/graphql` |

The store code is derived automatically from the locale suffix: `en_AU` → `au`, `en_NZ` → `nz`. Every request includes `Origin` and `Store` headers automatically.

---

## Test Files

### `pdp-load.test.ts` — PDP load test

Validates the `products(filter: { sku: { eq: $sku } })` GraphQL query at scale. Product SKUs are loaded from the appropriate `data/products-*.json` file via `DataProvider`/`SharedArray`.

**Executor:** `ramping-arrival-rate`  
**Profile:** 200 req/min → 500 req/min peak over 16 minutes  
**Quick mode:** `QUICK_TEST=true` → `constant-arrival-rate` at 5 req/min for 30 s

```bash
k6 run -e SITE=platypus-au -e ENVIRONMENT=staging dist/tests/pdp-load.test.js
k6 run -e SITE=platypus-au -e ENVIRONMENT=staging -e QUICK_TEST=true dist/tests/pdp-load.test.js
```

The `setup()` function calls `fail()` before VUs start if the selected site's product file contains `PLACEHOLDER-SKU` (currently: drmartens-au, drmartens-nz).

**Thresholds:**
- `http_req_duration` p(95) < 800ms, p(99) < 2000ms
- `http_req_failed` rate < 1%
- `scenario_pdp_success` rate > 99%
- `graphql_request_duration` p(95) < 800ms

---

### `plp-load.test.ts` — PLP load test

Validates the category listing query: `categoryList(filters: { url_path: ... })` followed by a product page query. Each VU picks a unique category using `(vuId * 7 + iteration) % categoryCount` to avoid cache bias.

**Executor:** `ramping-arrival-rate` — same profile as pdp-load.test  
**Data:** Category URL paths are inline per site (20 categories each), covering all 8 sites

```bash
k6 run -e SITE=drmartens-au -e ENVIRONMENT=staging dist/tests/plp-load.test.js
```

**Thresholds:**
- `plp_category_query_time` p(95) < 1500ms
- `plp_products_query_time` p(95) < 2000ms
- `plp_category_found` rate > 80%

---

### `place-order.test.ts` — Guest checkout (All 8 sites)

Full 9-step guest checkout flow. Supports all 8 sites (PLA/SKX/DRM/VAN × AU/NZ) — `setup()` warns if an unrecognised site ID is used.

**Executor:** `ramping-arrival-rate` — 5 orders/min steady state, 10 minutes total  
**Safety:** Iterations do nothing unless `ENABLE_PLACE_ORDER=true`

```bash
k6 run -e SITE=<site-id> -e ENABLE_PLACE_ORDER=true dist/tests/place-order.test.js
```

#### Checkout steps

| Step | GraphQL operation | Notes |
|---|---|---|
| 1 | `createEmptyCart` | Returns masked guest cart ID |
| 2 | `products` (query) | Resolves first in-stock configurable variant |
| 3 | `addConfigurableProductsToCart` | Uses parent SKU + child SKU |
| 4 | `setGuestEmailOnCart` | Unique per-VU email via `randomEmail()` |
| 5 | `setShippingAddressesOnCart` | Returns available shipping methods |
| 6 | `setShippingMethodsOnCart` | Auto-selects first home-delivery method |
| 7 | `setBillingAddressOnCart` | Same address as shipping |
| 8 | `setPaymentMethodOnCart` | Uses `PAYMENT_METHOD` env var |
| 9 | `placeOrder` | Returns order number |

**Magento-specific notes documented in code:**
- Use `createEmptyCart` (not `createGuestCart`) for guest carts on this instance
- Do **not** send `region_id` in cart addresses — region string only (e.g. `NSW`)
- Click & Collect carrier codes (`instore`, `storepickup`, `pickup`, `clickandcollect`) are filtered when auto-selecting shipping
- Child/variant SKUs are numeric strings on this store (e.g. `82218`)
- Vans NZ excludes SKU `VN000CR5FS8.WHT` — Varnish cache intermittently returns 0 in-stock variants for this SKU via k6 HTTP client

**Thresholds (tuned for ~13s checkout on staging):**
- `scenario_place_order_duration` p(95) < 20000ms
- `place_order_success` rate > 85%
- `place_order_mutation_time` p(95) < 8000ms (placeOrder is the heaviest step)

---

## Architecture

### Configuration flow

```
SITE + ENVIRONMENT env vars
        │
        ▼
  ConfigManager (singleton, init context)
  ├── SiteConfig     — endpoint, storeCode, headers, currency, rateLimit
  └── EnvironmentConfig — timeout, maxRetries, thinkTime, dryRun, isProduction
        │
        ├──► GraphQLClient  — created at module scope, once per VU
        ├──► DataProvider   — SharedArray wrapper, created at module scope
        └──► Scenario functions — pure functions, return ScenarioResult
```

`ConfigManager` is a singleton initialised once in the init context. It reads `SITE` and `ENVIRONMENT`, selects from 8 hard-coded site configs, and throws in `validateProductionSafety()` if production safety flags are missing. **Do not bypass this.**

### Why arrival-rate, not ramping-vus

```
ramping-vus                            ramping-arrival-rate (current)
─────────────────────────────────────  ─────────────────────────────────────
VUs are fixed; if server slows,        Rate is fixed; k6 spawns more VUs
RPS silently drops.                    to maintain target throughput.

"100 VU test" might deliver            "200 req/min" always delivers
30 req/min when server is slow.        200 req/min until maxVUs is hit.

Latency degradation is hidden          Latency degradation appears in
behind VU starvation.                  p(95)/p(99) metrics.
```

Each test has `preAllocatedVUs` (initial pool) and `maxVUs` (hard ceiling). If k6 cannot find a free VU to dispatch the next iteration, it logs a `dropped_iterations` warning — that is the signal that `maxVUs` needs to increase or the system under test is at its limit.

### GraphQL client (`src/lib/graphql-client.ts`)

- **Module-scope instantiation** (once per VU init) — TCP connections reused across iterations
- **Retry** with exponential backoff + ±20% jitter (default: 3 retries, 1 s initial delay)
- **Retries on:** HTTP 408/429/5xx and GraphQL `internal`/`graphql-rate-limited` error categories
- **Request tagging:** every request carries `site` and `operation` tags for Grafana/InfluxDB filtering
- **`lastParsedResult` guard:** prevents metrics double-counting when retries exhaust on a 2xx response that contains retryable GraphQL errors

```typescript
// ✅ Correct — module scope, one TCP pool per VU
const _client = new GraphQLClient(getSiteConfig());

export default function() {
  _client.query(...);
}

// ❌ Wrong — new TCP connection on every iteration
export default function() {
  const client = new GraphQLClient(getSiteConfig());
  client.query(...);
}
```

### DataProvider (`src/lib/data-provider.ts`)

Wraps k6's `SharedArray` to provide memory-efficient, strategy-aware data access.

```
SharedArray (one copy in memory across all VUs)
    │
    └──► DataProvider instance (per VU — has its own index/state)
              ├── 'random'     — Math.random() on each call
              ├── 'sequential' — increments index, wraps at end
              └── 'unique'     — rejection sampling until unused index found
```

**Available product providers:**

| Call | Data file | Used by |
|---|---|---|
| `getProductProvider('platypus')` | `products-platypus.json` | platypus-au, platypus-nz |
| `getProductProvider('skechers')` | `products-skechers.json` | skechers-au, skechers-nz |
| `getProductProvider('drmartens')` | `products-drmartens.json` | drmartens-au, drmartens-nz |
| `getProductProvider('vans-au')` | `products-vans-au.json` | vans-au |
| `getProductProvider('vans-nz')` | `products-vans-nz.json` | vans-nz |

In test files, use the site-ID convenience wrapper:

```typescript
// maps 'platypus-au' → 'platypus', 'vans-nz' → 'vans-nz', etc.
const provider = getProductProviderForSite(siteConfig.id, 'random');
```

**Critical: call at module scope, not inside `default()`.**  
A `DataProvider` called inside `default()` creates a new instance per iteration — the `sequential` strategy always returns item 0.

### Scenario pattern

All scenario functions are pure: they accept inputs + a `GraphQLClient` and return a typed result. Side effects (metrics, `check()`) happen in the calling test file so check labels carry meaningful context.

```typescript
// src/scenarios/pdp.ts
export function pdpScenario(
  productData: ProductData,
  client: GraphQLClient,
  siteConfig: SiteConfig
): { result: ScenarioResult; product: Product | null }
```

### k6 lifecycle per test file

```
init context (module scope, runs per VU before test starts)
  ├── getProductProviderForSite()   → SharedArray loaded once per VU
  ├── new GraphQLClient()           → TCP pool allocated
  └── export const options          → executor config + thresholds

export function setup()  — single special VU, runs once before VUs start
  ├── validate SITE, ENVIRONMENT flags
  ├── check product data for PLACEHOLDER-SKU → fail() aborts test
  └── return SetupData passed to every default() call

export default function(data)  — runs per VU, per iteration
  ├── pick product from provider.getNext()
  ├── run scenario function
  ├── check() results
  └── thinkTime()

export function teardown(data)  — single VU, runs once after all VUs stop
  └── log summary
```

---

## Product Data Management

### File format

```json
{
  "description": "Human-readable note",
  "site": "platypus",
  "lastUpdated": "2026-02-10",
  "data": [
    { "id": "prod-001", "sku": "ADYS400073-062.BLK", "productType": "configurable" },
    { "id": "prod-002", "sku": "ABC123.WHT",          "productType": "simple" }
  ]
}
```

### Site status

| Site | Product file | Status |
|---|---|---|
| platypus-au/nz | `products-platypus.json` | Real SKUs (refresh if products go OOS) |
| skechers-au/nz | `products-skechers.json` | Real SKUs |
| vans-au | `products-vans-au.json` | 8 confirmed configurable SKUs |
| vans-nz | `products-vans-nz.json` | 8 SKUs — VN000CR5FS8.WHT excluded (Varnish issue) |
| drmartens-au/nz | `products-drmartens.json` | **PLACEHOLDER — run discovery first** |

### Refreshing SKUs

```bash
# Discover products for a site (requires discover-products.js in dist/)
k6 run --env SITE=platypus-au dist/discover-products.js

# Update src/data/products-platypus.json with results, then rebuild
npm run build
```

### Placeholder fast-fail

`pdp-load.test.ts` `setup()` calls `fail()` immediately if the selected site's product file contains any `PLACEHOLDER-SKU` entry. The test aborts before VUs start rather than silently skipping iterations.

---

## Custom Metrics Reference

All metrics are defined in `src/lib/metrics.ts`.

### Scenario metrics

| Metric | Type | Description |
|---|---|---|
| `scenario_pdp_duration` | Trend (ms) | PDP query end-to-end |
| `scenario_pdp_success` | Rate | PDP success rate |
| `scenario_pdp_views` | Counter | Total PDP views |
| `scenario_plp_duration` | Trend (ms) | PLP query end-to-end |
| `scenario_plp_success` | Rate | PLP success rate |
| `scenario_login_duration` | Trend (ms) | Login flow |
| `scenario_login_success` | Rate | Login success rate |
| `scenario_place_order_duration` | Trend (ms) | Full 9-step checkout |
| `scenario_place_order_success` | Rate | Checkout success rate |
| `scenario_orders_placed` | Counter | Successful orders placed |

### Step-level checkout metrics

| Metric | Threshold |
|---|---|
| `place_order_guest_cart_create_time` | p(95) < 2000ms |
| `place_order_add_to_cart_time` | p(95) < 3000ms |
| `place_order_set_shipping_addr_time` | p(95) < 3000ms |
| `place_order_set_shipping_meth_time` | p(95) < 3000ms |
| `place_order_set_billing_addr_time` | p(95) < 3000ms |
| `place_order_set_payment_meth_time` | p(95) < 3000ms |
| `place_order_mutation_time` | p(95) < 8000ms |

### GraphQL client metrics

| Metric | Type | Description |
|---|---|---|
| `graphql_request_duration` | Trend (ms) | Total per-request duration (all retries) |
| `graphql_requests_total` | Counter | All GraphQL requests dispatched |
| `graphql_errors` | Rate | GraphQL-level error rate |
| `graphql_retries_total` | Counter | Retry attempts |

### Infrastructure metrics

| Metric | Description |
|---|---|
| `infra_ttfb` | Time to First Byte |
| `infra_tls_handshake` | TLS handshake time |
| `infra_connection_time` | TCP connection time |

### Threshold comparison: staging vs production

| Metric | Staging | Production |
|---|---|---|
| `http_req_duration` p(95) | 1000ms | 800ms |
| `http_req_duration` p(99) | 3000ms | 2000ms |
| `http_req_failed` rate | < 5% | < 1% |
| `http_req_waiting` p(95) | 300ms | 200ms |

---

## Adding a New Scenario

See `docs/HOW-TO-IMPLEMENT-SCENARIOS.md` for the complete walkthrough.

**1. Create `src/scenarios/my-scenario.ts`:**

```typescript
import { GraphQLClient } from '../lib/graphql-client';
import { recordScenarioMetrics } from '../lib/metrics';
import { SiteConfig, ScenarioResult } from '../types';

const MY_QUERY = `query MyQuery($sku: String!) { ... }`;

export function myScenario(
  input: { sku: string },
  client: GraphQLClient,
  siteConfig: SiteConfig
): { result: ScenarioResult } {
  const startTime = Date.now();
  const response  = client.query(MY_QUERY, { sku: input.sku });
  const duration  = Date.now() - startTime;
  const success   = !response.errors && !!response.data;

  recordScenarioMetrics('myScenario', duration, success, { site: siteConfig.id });
  return { result: { success, scenario: 'myScenario', duration } };
}
```

**2. Register metrics in `src/lib/metrics.ts`:**

```typescript
export const myScenarioDuration = new Trend('scenario_my_duration', true);
export const myScenarioSuccess  = new Rate('scenario_my_success');
```

**3. Wire into a test file (module scope for client/provider):**

```typescript
// Module scope — init context
const _client   = new GraphQLClient(getSiteConfig());
const _provider = getProductProviderForSite('platypus-au', 'random');

export default function(data: SetupData): void {
  const product = _provider.getNext();
  const { result } = myScenario({ sku: product.sku }, _client, data.siteConfig);
  check(result, { 'My scenario succeeded': r => r.success });
  thinkTime(getEnvironmentConfig());
}
```

**4. Add product/category data** to `src/data/` if the scenario needs site-specific inputs, and register them in `data-provider.ts`.

---

## Production Safety

Three independent gates guard production order placement:

```
ENVIRONMENT=production    → warns, continues (read-only queries OK)
ENABLE_PLACE_ORDER=true   → unlocks mutation steps (place-order)
PRODUCTION_CONFIRMED=true → required when ENABLE_PLACE_ORDER=true on production

Missing PRODUCTION_CONFIRMED + ENABLE_PLACE_ORDER=true on production:
  → ConfigManager.validateProductionSafety() throws in setup()
  → test aborts before any VU starts
```

### Safe production read-only run

```bash
k6 run \
  -e SITE=platypus-au \
  -e ENVIRONMENT=production \
  -e PRODUCTION_CONFIRMED=true \
  -e QUICK_TEST=true \
  dist/tests/pdp-load.test.js
```

### What requires explicit sign-off

```bash
# Creates real orders on production — requires authorization
k6 run \
  -e SITE=vans-au \
  -e ENVIRONMENT=production \
  -e PRODUCTION_CONFIRMED=true \
  -e ENABLE_PLACE_ORDER=true \
  dist/tests/place-order.test.js
```

---

## Troubleshooting

### `--vus` and `--duration` flags have no effect

When `scenarios` is defined in the exported `options` object, k6 **silently ignores** `--vus`, `--duration`, and `--iterations` CLI flags. The execution profile is fully controlled by the `scenarios` block in the test file.

To run a shorter test, use `QUICK_TEST=true` (pdp-load.test only) or temporarily edit the `stages` array in the test file before building.

### `dropped_iterations` warning during the run

```
WARN  Insufficient VUs, consider increasing maxVUs
```

The arrival-rate executor tried to fire more iterations than there were free VUs to handle. Either increase `maxVUs` in the scenario options, or the system under test is too slow to sustain the target rate at current `preAllocatedVUs`.

### `PLACEHOLDER-SKU` abort in setup

```
ERRO  Site 'drmartens-au' has PLACEHOLDER-SKU entries.
```

`setup()` calls `fail()` before VUs start. Run product discovery for that site to populate `src/data/products-drmartens.json`, then `npm run build`.

### Products found: 0% / "Product not found" (HTTP 200)

The SKU exists in the JSON data file but has been removed from the staging catalog (out of stock or delisted). HTTP is healthy — the data file needs refreshing. Run product discovery and rebuild.

### Remote jslib import failures in CI

`papaparse` and `k6-utils` are fetched from `jslib.k6.io` at runtime. In air-gapped or cache-cold CI environments the test will fail before starting. Pre-warm the cache with `test:quick` while network is available, or vendor the libraries into `src/lib/vendor/` and update imports.

### `graphql_request_duration` exceeds threshold but `http_req_duration` passes

`graphql_request_duration` captures total elapsed time from the start of `execute()`, including all retry sleep delays. `http_req_duration` measures only the final HTTP request. Divergence between the two metrics indicates retries are occurring.

### GraphQL 401 / store header errors

The `Store` header is set to the locale suffix (`au` or `nz`). If a site needs a different store code, set `BASE_URL` to override the endpoint or patch `config-manager.ts` directly.

### Slow staging servers exceed latency thresholds

Staging servers are deliberately slower than production. Thresholds in `staging.json` are set accordingly (p(95) 1000ms vs 800ms production). If staging consistently fails even relaxed thresholds, check `infra_ttfb` — if it is >600ms, the staging environment itself is under strain unrelated to the framework.

---

## Development

```bash
npm run validate          # TypeScript type-check (no emit)
npm run lint              # ESLint
npm run build             # Webpack production bundle
npm run build:watch       # Watch mode

# Full pre-commit check
npm run validate && npm run lint && npm run build && npm run test:quick
```

### Adding a new site

1. Add entry to `getSiteConfigs()` in `src/config/config-manager.ts`
2. Add both staging and production URLs to `environments/staging.json` and `environments/production.json`
3. Create `src/data/products-{brand}.json` (placeholder is fine — add real SKUs via discovery)
4. Add the new key to `DATA_PATHS` and `SITE_TO_PRODUCT_KEY` in `src/lib/data-provider.ts`
5. Add category paths to the `CATEGORIES` map in `plp-load.test.ts`
6. Add `SiteIdentifier` value to `src/types/index.ts`
7. Add npm scripts in `package.json`: `test:load:{site}-{country}` and `test:load:{site}-{country}:prod`
8. `npm run build`
