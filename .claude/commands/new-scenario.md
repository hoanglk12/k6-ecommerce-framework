# New Scenario

Scaffold a new k6 scenario for this framework. The argument is the scenario name in kebab-case (e.g. `search`, `wishlist`, `add-to-cart`).

Arguments: $ARGUMENTS

## Steps

1. **Read the existing pattern** — read `src/scenarios/place-order.ts` to understand the structure: scenario-local `Trend`/`Rate`/`Counter` metrics at the top, GraphQL operations as constants, and a single exported async function that accepts `(client: GraphQLClient, input: ..., siteConfig: SiteConfig)` and returns `Promise<ScenarioResult>`.

2. **Create `src/scenarios/<name>.ts`** with:
   - Scenario-specific `Trend`/`Rate`/`Counter` metrics declared at module scope
   - GraphQL query/mutation strings as `const` variables (named `<OPERATION>_QUERY` / `<OPERATION>_MUTATION`)
   - A single exported function named `<camelCaseName>Scenario` that:
     - Accepts a `GraphQLClient` and typed input object
     - Uses `group()` and `check()` from k6
     - Records results via its own `Trend.add()` / `Rate.add()` calls
     - Returns `ScenarioResult` (`{ success, scenario, duration, error?, data? }`)
   - Uses `measureTime()` from `@lib/utils` to capture step durations
   - Uses `createLogger()` from `@lib/logger` for debug output

3. **Register in `src/scenarios/index.ts`** — add the export.

4. **Wire into a test file** — ask the user which test file to integrate with (or create a new one). If creating a new test file, follow the pattern in `src/tests/pdp-load.test.ts`: `setup()`, `default()`, `teardown()`, module-level `GraphQLClient`, and k6 `options` with VU stages and thresholds.

5. **Add test data** if the scenario needs product SKUs, categories, or addresses — check `src/data/` for existing files and reuse where possible.

6. **Run validation**: `npm run validate` — fix any TypeScript errors before finishing.

Do not add metrics to `src/lib/metrics.ts` for the new scenario; keep scenario-local metrics in the scenario file itself (as seen in `place-order.ts`).
