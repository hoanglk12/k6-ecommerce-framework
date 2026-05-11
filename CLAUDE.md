# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A TypeScript/k6 load testing framework for Magento 2/Adobe Commerce eCommerce sites. Targets 8 sites (Platypus, Skechers, Dr Martens, Vans — AU and NZ variants) across staging and production environments.

## Commands

```bash
# Build
npm run build            # Webpack production bundle → dist/
npm run build:watch      # Watch mode
npm run clean            # Remove dist/

# Validate before running
npm run validate         # TypeScript type check (tsc --noEmit)
npm run lint             # ESLint TypeScript

# Run tests (always build first)
npm run test:load                        # Default: 200 VUs, 10m (platypus-au staging)
npm run test:load:platypus-au            # Platypus AU staging
npm run test:load:platypus-au:prod       # Platypus AU production
npm run test:load:vans-au                # Vans AU staging
npm run dry-run                          # Single iteration, no API mutations
npm run dashboard                        # k6 web dashboard at localhost:5665

# Custom run (after build)
k6 run --env SITE=skechers-nz --env ENVIRONMENT=staging dist/load.test.js
```

Naming convention for per-site scripts: `test:load:{site}-{country}` and `test:load:{site}-{country}:prod`.

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
