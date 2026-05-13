---
name: feedback-k6-patterns
description: k6 anti-patterns to avoid in this codebase — derived from 2026-05-11 review findings and H1–H4 fixes
metadata:
  type: feedback
---

**Do not use the top-level `stages` shorthand.** Always use `scenarios: { <name>: { executor, stages } }`.

**Why:** `stages` shorthand was flagged H1 in the framework review. It locks tests to single-journey, prevents mixed-executor runs, and cannot carry per-scenario thresholds.

**How to apply:** Any new test file or skill example must use the `scenarios` API. Update existing code that still uses top-level `stages` if you touch it.

---

**Do not write plain-string error-rate thresholds.** Use `{ threshold, abortOnFail: true, delayAbortEval: '30s' }` for any `rate<X` threshold.

**Why:** Plain strings never abort the test early, flagged H2 in the review.

**How to apply:** Rate/error thresholds → object form. Latency/duration thresholds (`p(95)<X`) → string form is acceptable.

---

**Do not call `check()` inside `src/lib/` or utility functions.** `check()` belongs in scenario/test files only.

**Why:** Generic check labels in library functions are untraceable in the summary, flagged H3 in the review. `checkGraphQLResponse()` was refactored to return a plain boolean.

**How to apply:** If a lib function needs to validate a response, return a boolean or structured result; let the caller add `check()` with a contextual label.

---

**Do not use `exec.vu.idInTest` for data distribution.** Use `exec.scenario.iterationInTest % data.length`.

**Why:** VU IDs are non-monotonic under `ramping-vus` and can collide across stages, flagged H4 in the review.

**How to apply:** Any `SharedArray` slice keyed to "which VU is this" must use `iterationInTest`, not `idInTest`.

---

**Do not pass `--vus` or `--duration` on the CLI when running these tests.** The `scenarios` API defines VU/duration in the script; CLI flags are silently ignored when `scenarios` is present.

**How to apply:** The `/run-test` command was updated to omit these flags. Follow the same pattern in any ad-hoc k6 commands.
