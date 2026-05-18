# Add Site

Add a new brand/site to the framework. The argument describes the new site (e.g. `converse-au AUD en_AU https://www.converse.com.au https://stag-converse-au.accentgra.com`).

Arguments: $ARGUMENTS

## Required information

Collect from `$ARGUMENTS` or ask the user for:
- **site-id** — kebab-case identifier, e.g. `converse-au` (must end in `-au` or `-nz`)
- **brand name** — display name for reporting, e.g. `Converse Australia`
- **currency** — `AUD` or `NZD`
- **locale** — `en_AU` or `en_NZ`
- **production URL** — e.g. `https://www.converse.com.au`
- **staging URL** — e.g. `https://stag-converse-au.accentgra.com` (follow existing accentgra.com pattern unless told otherwise)

## Steps

1. **Update `src/types/index.ts`** — add the new site-id to the `SiteIdentifier` union type.

2. **Update `src/config/config-manager.ts`** — add a new `createSiteConfig(...)` entry inside `getSiteConfigs()`, following the pattern of existing entries. The `storeCode` is derived automatically from locale (`en_AU` → `au`).

3. **Create data files** in `src/data/`:
   - `products-<brand>.json` — empty array `[]` with a note that SKUs must be discovered before running tests
   - `products-<brand>.csv` — header row only: `id,sku,urlKey,name,categoryPath,productType`
   - `categories-<brand>.json` — empty array `[]`
   If the country is NZ, confirm whether to reuse existing AU address data or create `addresses-nz.json` if it doesn't exist.

4. **Update `package.json`** — add npm scripts following the naming convention:
   ```
   "test:load:<site-id>": "k6 run -e SITE=<site-id> -e ENVIRONMENT=staging dist/tests/pdp-load.test.js",
   "test:load:<site-id>:prod": "k6 run -e SITE=<site-id> -e ENVIRONMENT=production dist/tests/pdp-load.test.js",
   "test:smoke:<site-id>": "k6 run -e SITE=<site-id> -e ENVIRONMENT=staging -e SMOKE_TEST=true dist/tests/pdp-load.test.js",
   "dashboard:<site-id>": "k6 run --out web-dashboard -e SITE=<site-id> -e ENVIRONMENT=staging dist/tests/pdp-load.test.js"
   ```
   Do not add `--vus` or `--duration` flags — these are ignored when a test file uses the `scenarios` API.

5. **Run `npm run validate`** to confirm TypeScript is happy, then show the user what was created and remind them to populate product SKUs in `src/data/products-<brand>.json` before running tests.

Do not create a separate test file for the new site unless explicitly asked — existing test files (`pdp-load.test.ts`, `plp-load.test.ts`) are site-agnostic via the `SITE` env var.
