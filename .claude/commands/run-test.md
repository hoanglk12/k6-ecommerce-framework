# Run Test

Build the project and run a k6 load test for a given site. Parses the argument string for site, environment, VU count, duration, and test type.

Arguments: $ARGUMENTS

## Argument parsing

Extract from `$ARGUMENTS`:
- **site** — one of `platypus-au`, `platypus-nz`, `skechers-au`, `skechers-nz`, `drmartens-au`, `drmartens-nz`, `vans-au`, `vans-nz`. Default: `platypus-au`
- **environment** — `staging` or `production`. Default: `staging`
- **test** — test file base name without `.js` (e.g. `load`, `plp-load`, `place-order`). Default: `load`
- **dashboard** — include `--out web-dashboard` flag if user mentions "dashboard". Default: off

> **Note**: do NOT pass `--vus` or `--duration` on the command line. All test files use the k6 `scenarios` API, which defines VU counts and stage durations inside the script. CLI `--vus`/`--duration` flags are ignored when `scenarios` is present in options.

## Steps

1. **Build**: `npm run build` — always build before running. If build fails, stop and show the error.

2. **Safety check**: if environment is `production`, confirm with the user before proceeding and remind them that `ENABLE_PLACE_ORDER` and `PRODUCTION_CONFIRMED` flags must be set explicitly if placing orders.

3. **Construct and run the k6 command**:

```
k6 run \
  [--out web-dashboard] \
  -e SITE=<site> \
  -e ENVIRONMENT=<environment> \
  dist/tests/<test>.test.js
```

For the `place-order` test, also append `-e ENABLE_PLACE_ORDER=true` if the user confirmed it, otherwise append `-e DRY_RUN=true`.

4. **After the run**, summarise the key threshold results (pass/fail) from k6's summary output.

## Examples

- "run platypus-au" → staging, load test
- "run skechers-nz production" → production (confirm first), load test
- "run vans-au place-order with dashboard" → place-order test, web dashboard enabled
- "dry run drmartens-au" → build then `npm run dry-run` with `-e SITE=drmartens-au`
