# Analyze Results

Summarize k6 result files from `results/` — latency percentiles, error rates, threshold status, and comparisons across sites/scenarios.

Arguments: $ARGUMENTS

## Argument parsing

Extract from `$ARGUMENTS` (all optional):
- **site** — one of the 8 site ids (`platypus-au` … `vans-nz`). Default: all sites present in `results/`
- **scenario** — `pdp`, `plp`, `place-order`, `mixed`. Default: all
- If `$ARGUMENTS` mentions "compare", compare the matching files against each other (e.g. same scenario across sites).

## Steps

1. List what exists: `Get-ChildItem results/ | Sort-Object LastWriteTime -Descending` — file names follow `{site}-{scenario}[-prod].json` (local load tests) and `smoke-*.json` (CI smoke).
2. If `results/` is empty or has no match for the filter, stop and tell the user which npm script produces the missing file (e.g. `npm run test:load:platypus-au` for `platypus-au-pdp.json`, `npm run test:smoke:ci` for smoke output).
3. **Delegate the analysis to the `results-analyzer` agent**, passing the file paths and the thresholds context (the agent reads `options.thresholds` from the matching `src/tests/*.test.ts`). The files are large NDJSON — they must be streamed, never read whole.
4. Relay the agent's findings: per-file p95/p99 vs thresholds with headroom, error-rate breakdown by status/scenario tag, and any regressions or anomalies it flags.

## Output

One section per analyzed file (site/scenario, run time, iterations, latency vs limits, errors), then a short overall verdict. Keep it scannable — no raw NDJSON, no full metric dumps.
