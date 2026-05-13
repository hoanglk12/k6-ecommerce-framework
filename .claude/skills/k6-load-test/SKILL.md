---
name: k6-load-test
description: Эксперт k6 нагрузочного тестирования. Используй для performance testing, load scenarios и stress tests.
---

# k6 Load Testing Expert

Expert in performance testing with k6 framework.

## Core k6 Principles

- **Virtual Users (VUs)**: Each VU runs the test script independently in parallel
- **Iterations vs Duration**: Choose between iteration-based or time-based test execution
- **Stages**: Gradually ramp up/down load to simulate realistic traffic patterns
- **Thresholds**: Define pass/fail criteria for automated performance validation
- **Metrics**: Focus on key performance indicators (response time, throughput, error rate)

## Basic Test Script Structure

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const customTrend = new Trend('custom_duration');

// Test configuration — use the scenarios API, not the stages shorthand
export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 10 },  // Ramp up to 10 users
        { duration: '5m', target: 10 },  // Stay at 10 users
        { duration: '2m', target: 20 },  // Ramp up to 20 users
        { duration: '5m', target: 20 },  // Stay at 20 users
        { duration: '2m', target: 0 },   // Ramp down to 0
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    // abortOnFail stops the test early instead of hammering a failing system;
    // delayAbortEval gives 30s of ramp-up noise before the rule is enforced.
    http_req_failed: [{ threshold: 'rate<0.1', abortOnFail: true, delayAbortEval: '30s' }],
    errors: [{ threshold: 'rate<0.1', abortOnFail: true, delayAbortEval: '30s' }],
  },
};

// Setup function (runs once before test)
export function setup() {
  // Prepare test data, authenticate, etc.
  const loginRes = http.post('https://api.example.com/auth/login', {
    email: 'test@example.com',
    password: 'password123',
  });

  return { token: loginRes.json('token') };
}

// Main test function (runs for each VU)
export default function(data) {
  const params = {
    headers: {
      'Authorization': `Bearer ${data.token}`,
      'Content-Type': 'application/json',
    },
  };

  const response = http.get('https://api.example.com/users', params);

  // Verify response
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'response body contains users': (r) => r.body.includes('users'),
  });

  // Track custom metrics
  errorRate.add(response.status !== 200);
  customTrend.add(response.timings.duration);

  // Think time between requests
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

// Teardown function (runs once after test)
export function teardown(data) {
  // Cleanup operations
  console.log('Test completed');
}
```

## Test Scenario Patterns

Always use the `scenarios` API — not the top-level `stages` shorthand. The `scenarios` API supports multiple concurrent journeys, per-scenario thresholds, and explicit executor configuration. The shorthand locks you to a single journey and a single executor.

### Load Test (Normal Traffic)

```javascript
export const options = {
  scenarios: {
    steady_load: {
      executor: 'ramping-vus',
      stages: [
        { duration: '5m', target: 50 },   // Ramp up
        { duration: '30m', target: 50 },  // Steady state
        { duration: '5m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
  },
};
```

### Stress Test (Beyond Normal Capacity)

```javascript
export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 300 },  // Beyond normal capacity
        { duration: '5m', target: 300 },
        { duration: '10m', target: 400 }, // Breaking point
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.20', abortOnFail: true, delayAbortEval: '30s' }],
  },
};
```

### Spike Test (Sudden Traffic Surge)

```javascript
export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      stages: [
        { duration: '10s', target: 100 },  // Quick ramp-up
        { duration: '1m', target: 100 },   // Stay at peak
        { duration: '10s', target: 0 },    // Quick ramp-down
      ],
      gracefulRampDown: '10s',
    },
  },
};
```

### Soak Test (Extended Duration)

```javascript
export const options = {
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      stages: [
        { duration: '5m', target: 50 },
        { duration: '4h', target: 50 },   // Run for 4 hours
        { duration: '5m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
};
```

### Breakpoint Test (Find Limits)

```javascript
export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '2m', target: 300 },
        { duration: '2m', target: 400 },
        { duration: '2m', target: 500 },
        // Continue until system breaks
      ],
    },
  },
};
```

### Mixed-Journey Realistic Load

Model realistic traffic with multiple concurrent user journeys in one test:

```javascript
export const options = {
  scenarios: {
    pdp_browse: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 50,
      maxVUs: 150,
      stages: [{ duration: '10m', target: 350 }], // 350 req/min
    },
    plp_browse: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1m',
      preAllocatedVUs: 10,
      duration: '10m',
    },
    guest_checkout: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1m',
      preAllocatedVUs: 5,
      duration: '10m',
      startTime: '2m', // start after ramp-up
      exec: 'checkoutScenario', // named export in the test file
    },
  },
};
```

## Advanced Patterns

### Data-Driven Testing

```javascript
import { SharedArray } from 'k6/data';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';

// Load CSV data once, share across VUs
const csvData = new SharedArray('users', function() {
  return papaparse.parse(open('./users.csv'), { header: true }).data;
});

export default function() {
  // Random user from dataset
  const user = csvData[Math.floor(Math.random() * csvData.length)];

  const payload = JSON.stringify({
    username: user.username,
    password: user.password,
  });

  const response = http.post('https://api.example.com/login', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(response, {
    'login successful': (r) => r.status === 200,
    'token present': (r) => r.json('token') !== '',
  });
}
```

### Session-Based Testing with Groups

```javascript
import { group, sleep } from 'k6';
import http from 'k6/http';

export default function() {
  let authToken;

  group('Authentication', function() {
    const loginRes = http.post('https://api.example.com/auth/login', {
      email: 'user@example.com',
      password: 'password123',
    });

    check(loginRes, { 'login successful': (r) => r.status === 200 });
    authToken = loginRes.json('token');
  });

  const headers = { Authorization: `Bearer ${authToken}` };

  group('Browse Products', function() {
    const productsRes = http.get('https://api.example.com/products', { headers });
    check(productsRes, { 'products loaded': (r) => r.status === 200 });

    const productId = productsRes.json('products')[0].id;
    const detailRes = http.get(`https://api.example.com/products/${productId}`, { headers });
    check(detailRes, { 'product detail loaded': (r) => r.status === 200 });
  });

  group('Add to Cart', function() {
    const cartRes = http.post('https://api.example.com/cart',
      JSON.stringify({ productId: 1, quantity: 2 }),
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    check(cartRes, { 'added to cart': (r) => r.status === 200 });
  });

  group('Checkout', function() {
    const checkoutRes = http.post('https://api.example.com/checkout',
      JSON.stringify({ paymentMethod: 'card' }),
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    check(checkoutRes, { 'checkout successful': (r) => r.status === 200 });
  });

  sleep(1);
}
```

### Batch Requests

```javascript
import http from 'k6/http';

export default function() {
  const responses = http.batch([
    ['GET', 'https://api.example.com/users'],
    ['GET', 'https://api.example.com/products'],
    ['GET', 'https://api.example.com/orders'],
    ['POST', 'https://api.example.com/events', JSON.stringify({ event: 'page_view' }), {
      headers: { 'Content-Type': 'application/json' },
    }],
  ]);

  check(responses[0], { 'users status 200': (r) => r.status === 200 });
  check(responses[1], { 'products status 200': (r) => r.status === 200 });
  check(responses[2], { 'orders status 200': (r) => r.status === 200 });
}
```

## Custom Metrics

```javascript
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';

// Define custom metrics
const pageViews = new Counter('page_views');
const activeUsers = new Gauge('active_users');
const errorRate = new Rate('error_rate');
const responseTrend = new Trend('response_trend');

export default function() {
  const response = http.get('https://api.example.com/page');

  // Record metrics
  pageViews.add(1);
  activeUsers.add(__VU);  // Current VU count
  errorRate.add(response.status !== 200);
  responseTrend.add(response.timings.duration);

  // Tags for segmentation
  pageViews.add(1, { page: 'home', version: 'v2' });
}
```

## Environment Configuration

### Command Line Options

```bash
# Basic run
k6 run script.js

# Specify VUs and duration
k6 run --vus 50 --duration 10m script.js

# Environment variables
k6 run --env BASE_URL=https://staging.api.com --env API_KEY=xxx script.js

# Output to different backends
k6 run --out influxdb=http://localhost:8086/k6 script.js
k6 run --out json=results.json script.js
k6 run --out csv=results.csv script.js

# Cloud execution
k6 cloud script.js

# Run with config file
k6 run --config config.json script.js
```

### Environment Variables in Script

```javascript
const BASE_URL = __ENV.BASE_URL || 'https://api.example.com';
const API_KEY = __ENV.API_KEY || 'default-key';
const ENVIRONMENT = __ENV.ENV || 'staging';

export default function() {
  const response = http.get(`${BASE_URL}/endpoint`, {
    headers: { 'X-API-Key': API_KEY },
  });
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Load Test

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          curl -L https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz | tar xvz
          sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/

      - name: Run load test
        run: k6 run --env BASE_URL=${{ secrets.API_URL }} tests/load-test.js

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: k6-results
          path: results.json
```

## Debugging and Analysis

```javascript
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Custom summary handler
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

export default function() {
  const response = http.get('https://api.example.com/data');

  // Detailed debugging on failure
  if (!check(response, { 'status is 200': (r) => r.status === 200 })) {
    console.error(`Request failed: ${response.status}`);
    console.error(`Response body: ${response.body.substring(0, 500)}`);
    console.error(`Request URL: ${response.request.url}`);
  }

  // Log slow requests
  if (response.timings.duration > 1000) {
    console.warn(`Slow request: ${response.timings.duration}ms - ${response.request.url}`);
  }
}
```

## Key Metrics Reference

| Metric | Description | Typical Threshold |
|--------|-------------|-------------------|
| `http_req_duration` | Response time | p(95)<500ms |
| `http_req_failed` | Failed request rate | rate<0.01 |
| `http_reqs` | Requests per second | N/A (informational) |
| `http_req_waiting` | Time to first byte | p(95)<200ms |
| `vus` | Active virtual users | N/A |
| `iterations` | Completed iterations | N/A |

## Best Practices

1. **Use the scenarios API** — never use the top-level `stages` shorthand; `scenarios` enables multiple journeys, explicit executor choice, and per-scenario thresholds.
2. **abortOnFail on error-rate thresholds** — always pair error-rate thresholds with `{ abortOnFail: true, delayAbortEval: '30s' }` so k6 stops instead of hammering a failing system.
3. **check() at the call site** — never call `check()` inside library/utility functions; checks belong in scenario or test files where the label can carry scenario context (e.g., `'PDP — product detail has stock status'`).
4. **Data index by iterationInTest** — when slicing SharedArray data per-VU, use `exec.scenario.iterationInTest % data.length`, not `exec.vu.idInTest - 1` (VU IDs are non-monotonic under ramping).
5. **SharedArray for all test data** — load data once at init context via `SharedArray`; never load inside `default()`.
6. **Realistic think time** — add `sleep()` between requests to model real user pacing.
7. **Tags for segmentation** — tag every request with `site`, `scenario`, and `operation` to enable Grafana filtering.
8. **check() labels are your debugging signal** — labels appear verbatim in the end-of-test summary; make them descriptive: `'PDP load — product SKU matches'` not `'has sku'`.
