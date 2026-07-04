# Cloud Run

Run a load test on Grafana Cloud k6 (account `hoanglk12.grafana.net`, project 4977765) with pre-upload safety checks. The account is limited to **100 VUs**.

Arguments: $ARGUMENTS

## Argument parsing

- **site** — one of the 8 site ids. Default: `platypus-au`
- **test** — `pdp`, `plp`, `place-order`, `mixed`. Default: `pdp`

Cloud tests always run against **staging** (the `test:cloud:*` scripts are configured for staging). If the user asks for a production cloud run, stop — that is not supported by the current scripts and needs explicit setup.

## Pre-upload checks (all must pass before running)

1. **VU limit**: read the target test file (`src/tests/pdp-load.test.ts`, `plp-load.test.ts`, `place-order.test.ts`, or `mixed-journey.test.ts`) and check every scenario's VU settings — `maxVUs`, `vus`, ramping `target` values, and for `mixed-journey` the **sum** across its concurrent scenarios. If any effective total exceeds 100, stop and report which scenario/value to lower.
2. **Auth**: confirm `$env:APPDATA\k6\config.json` exists (one-time `k6 cloud login` done — see CLAUDE.md for the command if missing).
3. **Type check**: `npm run validate`.
4. **place-order only**: confirm with the user that real staging orders are intended before running (the cloud script sets `ENABLE_PLACE_ORDER=true`).

## Run

Use the matching npm script — do **not** invoke `k6 cloud` directly (project settings deny raw `k6 cloud*` on purpose):

- `npm run test:cloud:{site}` (pdp) / `:plp` / `:place-order` / `:mixed` — e.g. `npm run test:cloud:skechers-au:plp`

If no script exists for the requested combination, list the available `test:cloud:*` scripts from package.json instead of improvising a raw command.

## Output

Report: the Grafana Cloud test-run URL from k6's output, final threshold pass/fail summary, and peak VUs reached. If the upload is rejected (VU limit, quota, auth), quote the exact error and the fix.
