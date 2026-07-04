# Refresh Data

Refresh a site's test data (`src/data/categories-*.json`, `products-*.json`) from its **staging** GraphQL endpoint. Stale SKUs and removed categories are the most common cause of smoke-test failures.

Arguments: $ARGUMENTS

## Argument parsing

- **site** (required) — one of `platypus-au`, `platypus-nz`, `skechers-au`, `skechers-nz`, `drmartens-au`, `drmartens-nz`, `vans-au`, `vans-nz`. If missing, ask.
- **what** — `categories`, `products`, or both. Default: both.

## Steps

1. **Discover**: delegate to the `graphql-data-explorer` agent with the site id. It queries the staging endpoint (never production), applies the per-brand category structure, and returns ready-to-paste JSON plus a list of currently-invalid entries in the existing data files.

2. **Map to the right files** (naming convention matters):
   - Categories: `categories-{brand}.json` for brands where AU/NZ share paths (**drmartens**, **vans**); `categories-{brand}-nz.json` where NZ differs (**platypus**, **skechers**). Refreshing `platypus-au` touches `categories-platypus.json`; `platypus-nz` touches `categories-platypus-nz.json`.
   - Products: match the existing per-brand file(s), including `.csv` twins where they exist (`products-platypus.csv`, `products-skechers.csv`) and `-au`/`-nz` variants (`products-vans-au.json`, `products-vans-nz.json`).

3. **Apply conservatively**: preserve the exact JSON shape of the existing file. Prefer removing dead entries and adding verified in-stock replacements over wholesale rewrites — other sites/tests may share the file (shared brand catalogs).

4. **Verify**:
   - `npm run validate`
   - Smoke against the refreshed site: `k6 run --vus 1 --iterations 1 -e SITE=<site> -e ENVIRONMENT=staging -e SMOKE_TEST=true src/tests/pdp-load.test.ts` and the same for `plp-load.test.ts` (or the matching `npm run test:smoke*` scripts when the site is platypus-au).

## Output

A diff-style summary per file: entries removed (and why — 404/out-of-stock), entries added, entries kept. Then the smoke verdict. Do not commit — leave that to the user.
