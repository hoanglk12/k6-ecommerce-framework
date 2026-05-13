---
name: k6
description: k6 load testing tool. Use for performance testing.
---

# k6

k6 is a developer-centric, open-source load testing tool suitable for testing APIs, microservices, and websites. It is written in Go but you script tests in JavaScript.

## When to Use

- **API Load Testing**: The gold standard for modern API performance testing.
- **CI/CD Integration**: Very lightweight binary (or Docker), easy to gate capabilities ("fail if p95 > 500ms").
- **Developer Friendly**: Uses JS (ES6) for scripting, so backend/frontend devs can write tests.

## Quick Start

```javascript
import http from "k6/http";
import { sleep, check } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
};

export default function () {
  const res = http.get("http://test.k6.io");
  check(res, {
    "status was 200": (r) => r.status == 200,
  });
  sleep(1);
}
```

Run with `k6 run script.js`.

## Core Concepts

### Virtual Users (VUs)

Simulated users that run your script in a loop. They are concurrent but not browser-based (unless you use xk6-browser), so they are CPU efficient.

### Checks & Thresholds

- **Check**: Boolean assertion that reports pass/fail % in the end-of-test summary. Does not stop the test. Place `check()` calls at the scenario or test layer — not inside library functions — so labels carry scenario context.
- **Threshold**: Pass/Fail criteria for the CI pipeline. Use the object form on error-rate thresholds so k6 aborts early instead of running for the full duration against a broken system.

```javascript
export const options = {
  thresholds: {
    http_req_duration: ['p(95)<500'],
    // abortOnFail stops the run early; delayAbortEval ignores ramp-up noise
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
  },
};
```

## Best Practices (2025)

**Do**:

- **Use the scenarios API**: Always define `scenarios: { ... }` in options rather than top-level `stages`. The `stages` shorthand locks you to a single journey; `scenarios` supports multiple concurrent journeys with independent executors, VU pools, and thresholds.
- **abortOnFail on error-rate thresholds**: Pair error-rate and failure-rate thresholds with `{ abortOnFail: true, delayAbortEval: '30s' }` to stop the test early when the system is clearly failing.
- **Modularize**: Split logic into folders. k6 supports ES modules (`import { ... } from './utils.js'`).
- **Correlate specific data**: Use `SharedArray` for test data loaded once at init context. Index by `exec.scenario.iterationInTest % data.length` (not by VU ID, which is non-monotonic under ramping).

**Don't**:

- **Don't call check() inside libraries**: `check()` labels appear in the summary with no scenario context. Keep checks in scenario/test files where labels can be meaningful.
- **Don't treat it like a browser**: Standard k6 `http` does not parse HTML or execute JS on the page. It just hits endpoints. Use `k6-browser` module if you strictly need browser rendering (but it's heavier).

## References

- [k6 Documentation](https://k6.io/docs/)
