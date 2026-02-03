# k6 eCommerce Load Testing Framework

A production-ready k6 TypeScript framework for load testing Australian eCommerce sites (Platypus Shoes & Skechers Australia).

## 🎯 Overview

This framework provides comprehensive load testing capabilities for GraphQL-based Magento 2/Adobe Commerce eCommerce platforms, focusing on critical user journeys.

### Target Sites
- **Platypus Shoes**: https://www.platypusshoes.com.au/
- **Skechers Australia**: https://www.skechers.com.au/

### Test Scenarios
| Scenario | Description | GraphQL Operations |
|----------|-------------|-------------------|
| Login | Customer authentication | `generateCustomerToken`, `customer` |
| PDP | Product detail page | `products`, `productDetail` |
| Add to Cart | Cart operations | `addProductsToCart`, `cart` |
| Checkout | Order placement | `setShipping`, `setPayment`, `placeOrder` |

## 📊 Performance Targets

| Metric | Target | Threshold |
|--------|--------|-----------|
| Average Requests | 200/min | - |
| Peak Requests | 500/min | - |
| P95 Latency | <800ms | Error |
| P99 Latency | <2000ms | Error |
| Error Rate | <1% | Error |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- k6 v0.49+ ([Installation Guide](https://k6.io/docs/getting-started/installation/))

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd k6-ecommerce-framework

# Install dependencies
npm install

# Build the tests
npm run build
```

### Running Tests

```bash
# Smoke Test (quick validation)
npm run test:smoke

# Load Test
npm run test:load

# Stress Test
npm run test:stress

# Spike Test
npm run test:spike

# Soak Test (endurance)
npm run test:soak

# Cloud Test (Grafana Cloud)
npm run test:cloud
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SITE` | Target site (`platypus` or `skechers`) | `platypus` |
| `ENVIRONMENT` | Environment (`staging` or `production`) | `staging` |
| `VUS` | Number of virtual users | varies |
| `DURATION` | Test duration | varies |
| `DRY_RUN` | Skip actual API calls | `false` |
| `ENABLE_PLACE_ORDER` | Enable order placement | `false` |
| `PRODUCTION_CONFIRMED` | Confirm production testing | `false` |

### Example Commands

```bash
# Test Platypus staging with 10 VUs for 2 minutes
k6 run --env SITE=platypus --env ENVIRONMENT=staging --vus 10 --duration 2m dist/tests/smoke.test.js

# Test Skechers staging with custom duration
k6 run --env SITE=skechers --env ENVIRONMENT=staging --duration 5m dist/tests/load.test.js

# Run with k6 dashboard
npm run dashboard
# Then access http://localhost:5665
```

## 📁 Project Structure

```
k6-ecommerce-framework/
├── .github/
│   └── workflows/
│       └── k6-tests.yml       # CI/CD pipeline
├── src/
│   ├── config/
│   │   ├── config-manager.ts  # Configuration management
│   │   ├── environments/      # Environment configs
│   │   │   ├── staging.json
│   │   │   └── production.json
│   │   └── index.ts
│   ├── data/
│   │   ├── users.json         # Test user credentials
│   │   ├── users.csv
│   │   ├── products-platypus.json
│   │   ├── products-skechers.json
│   │   └── addresses.json
│   ├── lib/
│   │   ├── graphql-client.ts  # GraphQL HTTP client
│   │   ├── auth-manager.ts    # Authentication handling
│   │   ├── data-provider.ts   # Data loading utilities
│   │   ├── metrics.ts         # Custom k6 metrics
│   │   ├── logger.ts          # Logging utilities
│   │   ├── utils.ts           # Helper functions
│   │   └── index.ts
│   ├── scenarios/
│   │   ├── login.ts           # Authentication scenario
│   │   ├── pdp.ts             # Product detail page
│   │   ├── add-to-cart.ts     # Cart operations
│   │   ├── checkout.ts        # Checkout flow
│   │   └── index.ts
│   ├── tests/
│   │   ├── smoke.test.ts      # Smoke tests
│   │   ├── load.test.ts       # Load tests
│   │   ├── stress.test.ts     # Stress tests
│   │   ├── spike.test.ts      # Spike tests
│   │   └── soak.test.ts       # Soak tests
│   └── types/
│       └── index.ts           # TypeScript definitions
├── docs/
│   ├── ARCHITECTURE.md        # Framework design
│   ├── SCENARIOS.md           # Scenario documentation
│   └── DEPLOYMENT.md          # Deployment guide
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

## 🔧 Configuration

### Site Configuration

Each site is configured in `src/config/config-manager.ts`:

```typescript
const siteConfigs: Record<string, SiteConfig> = {
  platypus: {
    name: 'Platypus Shoes',
    baseUrl: 'https://www.platypusshoes.com.au',
    graphqlEndpoint: 'https://www.platypusshoes.com.au/graphql',
    storeCode: 'default',
    currency: 'AUD',
    // ...
  },
  skechers: {
    name: 'Skechers Australia',
    baseUrl: 'https://www.skechers.com.au',
    graphqlEndpoint: 'https://www.skechers.com.au/graphql',
    storeCode: 'default',
    currency: 'AUD',
    // ...
  }
};
```

### Environment Configuration

Configure environments in `src/config/environments/`:

```json
{
  "name": "staging",
  "maxVUs": 50,
  "maxDuration": "30m",
  "rateLimit": 100,
  "features": {
    "enableLogin": true,
    "enableAddToCart": true,
    "enableCheckout": true,
    "enablePlaceOrder": false
  }
}
```

### Test Data

Test data is stored in `src/data/` in both JSON and CSV formats:

- **users.json/csv**: Test user credentials
- **products-{site}.json/csv**: Site-specific product SKUs
- **addresses.json/csv**: Australian shipping addresses

## 📈 Metrics & Thresholds

### Standard k6 Metrics
- `http_req_duration`: Request latency
- `http_req_failed`: Request failure rate
- `http_reqs`: Request count
- `vus`: Virtual users

### Custom Metrics
- `graphql_query_duration`: GraphQL query latency
- `graphql_mutation_duration`: Mutation latency
- `graphql_errors`: GraphQL error count
- `login_duration`: Login flow duration
- `pdp_duration`: PDP load duration
- `add_to_cart_duration`: Cart operation duration
- `checkout_duration`: Checkout flow duration
- `place_order_duration`: Order placement duration
- `business_orders_placed`: Orders created
- `business_cart_value`: Cart values

### Default Thresholds

```javascript
thresholds: {
  http_req_duration: ['p(95)<800', 'p(99)<2000'],
  http_req_failed: ['rate<0.01'],
  graphql_errors: ['count<10'],
  login_duration: ['p(95)<3000'],
  pdp_duration: ['p(95)<2000'],
  add_to_cart_duration: ['p(95)<3000'],
  checkout_duration: ['p(95)<5000']
}
```

## 🔒 Safety Features

### Production Guards

The framework includes multiple safety mechanisms for production testing:

1. **Environment Confirmation**: Set `PRODUCTION_CONFIRMED=true`
2. **Order Placement Toggle**: Set `ENABLE_PLACE_ORDER=true`
3. **Rate Limiting**: Configurable per environment
4. **Dry Run Mode**: Set `DRY_RUN=true` to skip mutations
5. **VU Limits**: Maximum VUs enforced per environment

### Example Safe Production Test

```bash
# Dry run against production (no actual orders)
k6 run \
  --env SITE=platypus \
  --env ENVIRONMENT=production \
  --env PRODUCTION_CONFIRMED=true \
  --env DRY_RUN=true \
  --vus 5 \
  --duration 1m \
  dist/tests/smoke.test.js
```

## 🚢 CI/CD Integration

### GitHub Actions

The framework includes a comprehensive GitHub Actions workflow:

| Trigger | Test Type | Sites | Duration |
|---------|-----------|-------|----------|
| Pull Request | Smoke | Both | 2m each |
| Schedule (daily) | Regression | Both | 5m each |
| Manual | Any | Selectable | Configurable |

### Secrets Required

| Secret | Description |
|--------|-------------|
| `K6_CLOUD_TOKEN` | Grafana Cloud API token |
| `K6_CLOUD_PROJECT_ID` | Grafana Cloud project ID |

### Manual Workflow Dispatch

Trigger tests manually via GitHub Actions UI with options for:
- Test type (smoke, load, stress)
- Target site (platypus, skechers)
- Virtual users
- Duration

## 📊 Reporting

### k6 Dashboard

Run tests with the built-in dashboard:

```bash
npm run dashboard
```

Access at http://localhost:5665

### Grafana Cloud

Push results to Grafana Cloud:

```bash
K6_CLOUD_TOKEN=your_token npm run test:cloud
```

### JSON Output

Generate JSON results for further analysis:

```bash
k6 run --out json=results.json dist/tests/smoke.test.js
```

## 🛠 Development

### Building

```bash
# Development build (watch mode)
npm run build:watch

# Production build
npm run build
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Type Checking

```bash
npm run type-check
```

## 📝 Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) - Framework design decisions
- [Scenarios Guide](docs/SCENARIOS.md) - Test scenario documentation
- [Deployment Guide](docs/DEPLOYMENT.md) - Grafana Cloud vs GitHub Actions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- [k6](https://k6.io/) - Modern load testing tool
- [Grafana Labs](https://grafana.com/) - Cloud platform
- [TypeScript](https://www.typescriptlang.org/) - Type safety
