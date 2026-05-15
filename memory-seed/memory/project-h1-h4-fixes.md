---
name: project-h1-h4-fixes
description: Architectural decisions enforced after the 2026-05-11 k6-framework-review: scenarios API, abortOnFail thresholds, no check() in libs, iterationInTest data indexing
metadata:
  type: project
---

Four high-priority issues from `k6-framework-review.html` were fixed on 2026-05-13.

**H1 — Scenarios API adopted** (`load.test.ts`, `plp-load.test.ts`, `place-order.test.ts`)
Top-level `stages:` shorthand replaced with `scenarios: { <name>: { executor, stages, gracefulRampDown } }`. Named scenarios: `pdp_browse`, `plp_browse`, `guest_checkout`.

**Why:** `stages` shorthand locks every test to a single journey. The `scenarios` API enables multiple concurrent journeys, per-scenario thresholds, and explicit executor configuration.

**How to apply:** All new test files and the `/new-scenario` command must use `scenarios: { ... }`, never top-level `stages`. CLI `--vus`/`--duration` flags must not be passed when `scenarios` is defined (they are ignored by k6).

---

**H2 — abortOnFail on error-rate thresholds** (all 3 test files)
`http_req_failed` and `graphql_errors` thresholds converted from plain strings to `{ threshold: '...', abortOnFail: true, delayAbortEval: '30s' }`.

**Why:** Without `abortOnFail`, k6 runs the full test duration even when the error rate is 50% at minute 2 — wasting time and hammering a failing system.

**How to apply:** Any threshold that is a rate/error metric (`rate<X`) must use the object form with `abortOnFail: true, delayAbortEval: '30s'`. Duration/latency thresholds (`p(95)<X`) can remain as strings.

---

**H3 — No check() inside library functions** (`src/lib/graphql-client.ts`)
`checkGraphQLResponse()` previously called `check()` internally. Now it returns a plain `boolean` (`!hasErrors && hasData`). The `check` import was removed from the file.

**Why:** k6's end-of-test summary groups checks by label. A generic label like "GraphQL response has no errors" in a library gives no indication of which scenario failed. `check()` belongs at the scenario/test layer where labels carry context.

**How to apply:** Never call `check()` inside `src/lib/` or `src/config/`. Scenario files (`src/scenarios/`) and test files (`src/tests/`) are the only valid places.

---

**H4 — Data indexing uses iterationInTest** (`src/lib/data-provider.ts`)
`DataProvider.getByVU()` changed from `(exec.vu.idInTest - 1) % data.length` to `exec.scenario.iterationInTest % data.length`.

**Why:** VU IDs under `ramping-vus` are assigned sequentially as VUs start and not reassigned when VUs are destroyed between stages. A VU spun up at peak with ID 100 maps to the same slot as a different VU from an earlier stage. `iterationInTest` is monotonically increasing and works correctly across all executors.

**How to apply:** Whenever slicing a SharedArray by "current VU", use `exec.scenario.iterationInTest`. Never use `exec.vu.idInTest` for data distribution.
