# Preflight

Run the full pre-commit routine: type check, lint, then the smoke suite. Stop at the first failure.

Arguments: $ARGUMENTS

## Steps

Run these in order, stopping immediately at the first failure and showing its output:

1. `npm run validate` — TypeScript type check
2. `npm run lint` — ESLint
3. `npm run test:smoke` — PDP smoke (platypus-au staging, 1 VU × 1 iteration)
4. `npm run test:smoke:plp` — PLP smoke
5. `npm run test:smoke:mixed` — mixed-journey smoke (PDP + PLP)

> **Place-order smoke is excluded by default** because it can place a real order on staging. Run it only if `$ARGUMENTS` contains `place-order` or `all`, and use `npm run test:smoke:place-order` as-is (its script already sets the correct flags).

If the `k6-test-runner` agent is available, delegate steps 3-5 to it in a single task so the noisy k6 output stays out of this conversation.

## Output

Print a compact summary table at the end:

```
Preflight — <n>/<total> passed
✓ validate
✓ lint
✓ smoke: pdp        (thresholds 4/4)
✓ smoke: plp        (thresholds 4/4)
✗ smoke: mixed      (http_req_failed 2.1% > 1%)
```

For a failed smoke run, include only the breached thresholds and the first distinct error message — not the full k6 output. Finish with a one-line verdict: **ready to commit** or **fix N issues first**.
