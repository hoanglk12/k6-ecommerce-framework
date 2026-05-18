# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A TypeScript/k6 load testing framework for Magento 2/Adobe Commerce eCommerce sites. Targets 8 sites (Platypus, Skechers, Dr Martens, Vans — AU and NZ variants) across staging and production environments.

## Runtime

k6 v2.0.0 is installed at `C:\Tools\k6-v2.0.0\k6.exe` and is not on the system PATH by default.

```powershell
# PowerShell (Claude Code sessions use this)
$env:PATH += ";C:\Tools\k6-v2.0.0"

# cmd
set PATH=%PATH%;C:\Tools\k6-v2.0.0
```

Git is also not on the default PowerShell PATH. Use the full path when needed:

```powershell
$git = "C:\Users\Lincoln.Pham\AppData\Local\Programs\Git\cmd\git.exe"
& $git status
# Or add to PATH for the session:
$env:PATH += ";C:\Users\Lincoln.Pham\AppData\Local\Programs\Git\cmd"
```

## Commands

```bash
# Build
npm run build            # Webpack production bundle → dist/
npm run build:watch      # Watch mode
npm run clean            # Remove dist/

# Validate before running
npm run validate         # TypeScript type check (tsc --noEmit)
npm run lint             # ESLint TypeScript

# Smoke tests (1 VU × 1 iteration — run after every change)
npm run test:smoke            # PDP smoke — platypus-au staging
npm run test:smoke:plp        # PLP smoke — platypus-au staging
npm run test:smoke:place-order  # Place-order smoke — platypus-au staging

# CI smoke (writes JSON results to results/)
npm run test:smoke:ci         # PDP smoke with JSON output
npm run test:smoke:ci:plp     # PLP smoke with JSON output

# Local load tests (always build first)
npm run test:load:platypus-au            # Platypus AU staging (PDP)
npm run test:load:platypus-au:prod       # Platypus AU production (PDP)
npm run test:load:vans-au                # Vans AU staging
npm run dry-run                          # Single iteration, no API mutations
npm run dashboard                        # k6 web dashboard at localhost:5665

# Cloud tests (Grafana Cloud — requires auth setup, see below)
npm run test:cloud:plp                   # PLP load test — platypus-au staging
npm run test:cloud:platypus-au           # PDP load test — platypus-au staging
npm run test:cloud:skechers-au           # PDP load test — skechers-au staging

# Custom run (after build)
k6 run -e SITE=skechers-nz -e ENVIRONMENT=staging dist/tests/pdp-load.test.js
```

Naming convention for per-site scripts: `test:load:{site}-{country}` and `test:load:{site}-{country}:prod`.

> **Note**: npm scripts with `--vus`/`--duration` flags are legacy shortcuts. All test files use the k6 `scenarios` API which defines VUs and durations inside the script — the CLI flags are ignored when `scenarios` is present.

## k6 Cloud Authentication

Tests run on Grafana Cloud k6 (account: `hoanglk12.grafana.net`, project ID: 4977765). Auth config is saved globally via:

```powershell
$env:PATH += ";C:\Tools\k6-v2.0.0"
k6 cloud login -t 354cf5f830ffa2a40bc9057d5ca227e6a40a55d89ee409d6e8f5c1ba460fe910 --stack hoanglk12
```

This writes config to `%APPDATA%\k6\config.json` and is a **one-time setup per machine**. After that, `k6 cloud run ...` and `npm run test:cloud:*` work without additional flags.

**Account limit**: 100 VUs maximum. Set `maxVUs: 100` in any `ramping-arrival-rate` scenario before uploading to cloud.

## Architecture

### Configuration Flow

```
Environment Variables → ConfigManager (singleton) → SiteConfig + EnvironmentConfig
                                                   → GraphQLClient + Scenarios → Custom Metrics
```

`ConfigManager` (`src/config/config-manager.ts`) is the single source of truth. It reads `SITE` and `ENVIRONMENT` env vars to select from 8 hard-coded site configs and two environment JSON files (`src/config/environments/staging.json`, `production.json`).

### Key Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `SITE` | `platypus-au` | Site ID (e.g. `vans-nz`, `skechers-au`) |
| `ENVIRONMENT` | `staging` | `staging` or `production` |
| `DRY_RUN` | `false` | Skip mutations, no real orders |
| `ENABLE_PLACE_ORDER` | `false` | Safety flag required for order placement |
| `PRODUCTION_CONFIRMED` | `false` | Required for production + order placement |
| `DEBUG` | `false` | Verbose logging |

### Test Structure

Every test file in `src/tests/` follows the k6 lifecycle:
1. **`setup()`** — initialize config, validate production safety flags
2. **`default(data)`** — per-VU-iteration function; calls scenario modules
3. **`teardown(data)`** — cleanup and summary reporting

Module-level `GraphQLClient` instances are created once per VU (not per iteration) to reuse connections — do not move them inside `default()`.

Module-level `DataProvider` instances (via `getCategoryProvider`, `getProductProviderForSite`, etc.) are also created once per VU — do not move them inside `default()`.

### Scenario Pattern

Each file in `src/scenarios/` exports a function that accepts a `GraphQLClient` and returns a `ScenarioResult`:

```typescript
export async function runPdpScenario(client: GraphQLClient, sku: string): Promise<ScenarioResult> {
  // ... GraphQL query
  return { success: true, data: product, duration: elapsed };
}
```

Scenarios are pure functions — all side effects (metrics, logging) are handled by the caller in the test file.

### GraphQL Client

`src/lib/graphql-client.ts` wraps k6's `http.post` with:
- Exponential backoff retry (configurable per environment)
- Automatic HTTP + GraphQL error detection
- Request tagging for Grafana filtering (`site`, `environment`, `scenario` tags)
- Token-based auth header injection for customer scenarios

### Custom Metrics

Defined in `src/lib/metrics.ts`. All business KPIs (orders placed, cart value, conversion rate) and per-scenario durations are tracked as k6 `Trend`/`Counter`/`Rate` metrics. Thresholds are set in each test file's `options.thresholds` and differ between staging (lenient) and production (strict).

### Threshold Pattern

Error-rate and success-rate thresholds always apply. Latency thresholds are wrapped in `...(isSmokeTest ? {} : { ... })` so they are skipped during smoke runs — a single cold request to staging will always breach latency SLOs and is not a meaningful signal.

### Data Provider Pattern

All test data (products, categories, users, addresses) must be loaded via `src/lib/data-provider.ts` using `SharedArray` — never declare test data as inline arrays in test files. Each data type has a factory function:

| Factory | Data |
|---|---|
| `getCategoryProvider(siteId)` | Category URL paths per site |
| `getProductProviderForSite(siteId)` | Product SKUs per brand |
| `getUserProvider(strategy)` | Test user credentials |
| `getAddressProvider(strategy)` | Shipping addresses |

Category JSON files in `src/data/` follow the naming convention `categories-{brand}.json` for brands where AU/NZ share the same paths (drmartens, vans), and `categories-{brand}-nz.json` where NZ differs (platypus, skechers).

**Category structure varies by brand** — do not assume all brands share the same shape:
- **Platypus** (`platypus-au`, `platypus-nz`): Organized by **brand** — `adidas`, `converse`, `new-balance`, `dr-martens`, etc. AU and NZ share the same catalog.
- **Skechers**: Organized by gender — `women`, `men`, `kids`, `sale` (+ subcategories like `women/gowalk`, `men/skech-air`). AU and NZ are identical.
- **Dr Martens**: Organized by gender — `unisex`, `women`, `men`, `kids`, `sale` (+ subcategories).
- **Vans**: Organized by gender — `mens`, `womens`, `kids`, `sale` (+ subcategories like `mens/shoes`, `womens/shoes`). AU and NZ share the same catalog.

To discover valid URL paths for a site, query its staging GraphQL endpoint:
```graphql
{ categoryList(filters: { parent_id: { in: ["2"] } }) { url_path product_count children { url_path product_count } } }
```

### Webpack Bundling

`webpack.config.js` creates one bundle per `src/tests/*.ts` file. Data files (`src/data/`) and config JSONs are copied to `dist/` via `CopyWebpackPlugin` — this is why `dist/` must be populated before running k6. Path aliases (`@lib`, `@config`, `@scenarios`, etc.) are resolved by webpack, not Node.js.

## Adding a New Scenario

See `docs/HOW-TO-IMPLEMENT-SCENARIOS.md` for a full walkthrough. The pattern is:
1. Add GraphQL operation to the scenario file in `src/scenarios/`
2. Register scenario-specific `Trend` metrics in `src/lib/metrics.ts`
3. Invoke the scenario from the appropriate test file in `src/tests/`
4. Add per-site product/category data to `src/data/` if needed

## Production Safety

Production tests require `PRODUCTION_CONFIRMED=true`. Order placement additionally requires `ENABLE_PLACE_ORDER=true`. The `ConfigManager` throws at `setup()` if these flags are missing — this is intentional and must not be bypassed.

## Docs

- `docs/ARCHITECTURE.md` — detailed component diagrams
- `docs/SCENARIOS.md` — GraphQL operations per scenario
- `docs/DEPLOYMENT.md` — Grafana Cloud and CI/CD setup
- `docs/HOW-TO-IMPLEMENT-SCENARIOS.md` — step-by-step scenario guide
<!-- autoskills:start -->

Summary generated by `autoskills`. Check the full files inside `.claude/skills`.

## k6 Load Testing Expert

Эксперт k6 нагрузочного тестирования. Используй для performance testing, load scenarios и stress tests.

- `.claude/skills/k6-load-test/SKILL.md`

## k6

k6 load testing tool. Use for performance testing.

- `.claude/skills/k6/SKILL.md`

## Node.js Backend Patterns

Build production-ready Node.js backend services with Express/Fastify, implementing middleware patterns, error handling, authentication, database integration, and API design best practices. Use when creating Node.js servers, REST APIs, GraphQL backends, or microservices architectures.

- `.claude/skills/nodejs-backend-patterns/SKILL.md`
- `.claude/skills/nodejs-backend-patterns/references/advanced-patterns.md`: Advanced patterns for dependency injection, database integration, authentication, caching, and API response formatting.

## Node.js Best Practices

Node.js development principles and decision-making. Framework selection, async patterns, security, and architecture. Teaches thinking, not copying.

- `.claude/skills/nodejs-best-practices/SKILL.md`

## TypeScript Advanced Types

Master TypeScript's advanced type system including generics, conditional types, mapped types, template literals, and utility types for building type-safe applications. Use when implementing complex type logic, creating reusable type utilities, or ensuring compile-time type safety in TypeScript pr...

- `.claude/skills/typescript-advanced-types/SKILL.md`

<!-- autoskills:end -->
