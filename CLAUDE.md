# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A TypeScript/k6 load testing framework for Magento 2/Adobe Commerce eCommerce sites. Targets 8 sites (Platypus, Skechers, Dr Martens, Vans — AU and NZ variants) across staging and production environments.

## Runtime

k6 is a compiled Go binary installed separately from Node/npm.

### New machine setup (admin rights required)

```powershell
# Install k6 via winget (adds to system PATH automatically — preferred)
winget install k6

# Alternatives
choco install k6   # Chocolatey
scoop install k6   # Scoop
```

After a package-manager install, `k6` is on the system PATH and all npm scripts work without further configuration.

### Machines without admin rights (e.g. Lincoln's workstation)

k6 v2.0.0 was manually extracted to `C:\Tools\k6-v2.0.0\k6.exe` and is **not** on the system PATH. Add it for the current shell session before running k6 directly:

```powershell
# PowerShell
$env:PATH += ";C:\Tools\k6-v2.0.0"

# cmd
set PATH=%PATH%;C:\Tools\k6-v2.0.0
```

> This PATH step is only needed on machines where k6 was manually extracted. On machines with admin rights where k6 was installed via winget/choco/scoop, it is already on the system PATH and npm scripts work without any extra setup.

Git is also not on the default PowerShell PATH on this machine:

```powershell
$env:PATH += ";C:\Users\Lincoln.Pham\AppData\Local\Programs\Git\cmd"
# Or use the full path: & "C:\Users\Lincoln.Pham\AppData\Local\Programs\Git\cmd\git.exe" status
```

## Commands

k6 (v0.57+, this repo targets v1.3.0) runs TypeScript test files directly — there is no build step. `npm run build`/`clean`/`prepare` do not exist; test files execute straight from `src/tests/*.test.ts`.

```bash
# Validate before running
npm run validate         # TypeScript type check (tsc --noEmit)
npm run lint             # ESLint TypeScript

# Smoke tests (1 VU × 1 iteration — run after every change)
npm run test:smoke            # PDP smoke — platypus-au staging
npm run test:smoke:plp        # PLP smoke — platypus-au staging
npm run test:smoke:place-order  # Place-order smoke — platypus-au staging
npm run test:smoke:mixed        # Mixed-journey smoke (PDP + PLP) — platypus-au staging

# CI smoke (writes JSON results to results/)
npm run test:smoke:ci         # PDP smoke with JSON output
npm run test:smoke:ci:plp     # PLP smoke with JSON output

# Local load tests (no build needed — runs src/tests/*.test.ts directly)
npm run test:load:platypus-au            # Platypus AU staging (PDP)
npm run test:load:platypus-au:prod       # Platypus AU production (PDP)
npm run test:load:vans-au                # Vans AU staging
npm run test:load:platypus-au:mixed      # Mixed-journey (70% PDP / 20% PLP / 10% checkout)
npm run test:load:platypus-au:plp        # PLP load test
npm run test:load:platypus-au:place-order # Place-order load test (requires ENABLE_PLACE_ORDER=true, baked into script)
npm run dry-run                          # Single iteration, no API mutations
npm run dashboard                        # k6 web dashboard at localhost:5665

# Cloud tests (Grafana Cloud — requires auth setup, see below)
npm run test:cloud:plp                   # PLP load test — platypus-au staging
npm run test:cloud:platypus-au           # PDP load test — platypus-au staging
npm run test:cloud:skechers-au           # PDP load test — skechers-au staging

# Custom run
k6 run -e SITE=skechers-nz -e ENVIRONMENT=staging src/tests/pdp-load.test.ts
```

Naming convention for per-site scripts: `test:load:{site}-{country}[:prod|:plp|:place-order|:mixed]`. Every one of the 8 sites has the full family (PDP, PDP-prod, PLP, place-order, mixed) plus matching `test:cloud:*` and `test:smoke:*` variants.

> **Note**: npm scripts with `--vus`/`--duration` flags are legacy shortcuts. All test files use the k6 `scenarios` API which defines VUs and durations inside the script — the CLI flags are ignored when `scenarios` is present.

> **Note**: local load-test scripts write structured results to `results/{site}-{scenario}[-prod].json` via `--out json=...` (gitignored — for local trend inspection, not committed baselines). Cloud scripts don't need this since Grafana Cloud already tracks results.

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

`src/tests/mixed-journey.test.ts` is the exception to the single-`default()` pattern: it models a realistic 70% PDP / 20% PLP / 10% guest-checkout traffic mix by giving each `scenarios` entry its own `exec: 'fnName'` (`pdpBrowse`, `plpBrowse`, `guestCheckout`) instead of routing through one shared `default()`. The `guest_checkout` scenario is only registered in `options.scenarios` when `ENABLE_PLACE_ORDER=true` (checked in the init-context `options` block, not inside the exec function) — each iteration places a real staging order, so it must stay opt-in.

### Scenario Pattern

Each file in `src/scenarios/` exports a function that accepts a `GraphQLClient` and returns a `ScenarioResult`:

```typescript
export async function runPdpScenario(client: GraphQLClient, sku: string): Promise<ScenarioResult> {
  // ... GraphQL query
  return { success: true, data: product, duration: elapsed };
}
```

Scenarios are pure functions — all side effects (metrics, logging) are handled by the caller in the test file.

### Enforced Test-File Conventions

These are hard rules, not style preferences — all three were flagged in a past framework review and are checked in every current test file:

1. **Always use the `scenarios` API**, never top-level `stages:` shorthand. `stages` locks a test to one executor/journey and can't carry per-scenario thresholds.
2. **Never call `check()` inside `src/lib/` or `src/config/`.** Library functions return a plain boolean/result; `check()` with a contextual label belongs in `src/scenarios/` or `src/tests/` only — a generic check label inside a lib function is untraceable in the k6 summary.
3. **Use `exec.scenario.iterationInTest` for `SharedArray` data distribution, never `exec.vu.idInTest`.** VU IDs are assigned sequentially and are not reassigned when VUs are destroyed between stages, so `idInTest` can collide across stages under `ramping-vus`/arrival-rate executors.

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

Rate/error thresholds (`http_req_failed`, `graphql_errors`) must use the object form, not a plain string: `[{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }]`. Without `abortOnFail`, k6 runs the full test duration even when the error rate is already 50% at minute 2. Latency thresholds (`p(95)<X`) stay as plain strings.

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

### Native TypeScript Execution (no bundler)

k6 (v0.57+) runs `.ts` files directly — there is no webpack/Babel build step and no `dist/` output. Two things follow from that:

- **Relative imports must include explicit extensions.** k6's module resolver does not auto-append `.ts` or resolve a directory to its `index.ts` the way webpack/Node do. Write `from '../lib/logger.ts'` and `from '../config/index.ts'`, not `from '../lib/logger'` or `from '../config'`. `tsconfig.json` sets `allowImportingTsExtensions: true` + `noEmit: true` to make `tsc --noEmit` accept this.
- **No path aliases.** `@lib`, `@config`, `@scenarios`, etc. were never actually resolvable without a bundler and are not used anywhere in `src/` — use relative imports only.

Data files (`src/data/`) and config JSONs (`src/config/environments/`) are read directly from `src/` via `open('../data/....json')` — nothing needs to be copied anywhere before running k6.

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
