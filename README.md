# k6 eCommerce Load Testing Framework

A production-ready k6 TypeScript framework for load testing Australian/New Zealand eCommerce sites (Platypus Shoes, Skechers Australia, Vans AU & Vans NZ).

## 🎯 Overview

This framework provides comprehensive load testing capabilities for GraphQL-based Magento 2/Adobe Commerce eCommerce platforms, focusing on critical user journeys.

### Target Sites
- **Platypus Shoes**: https://www.platypusshoes.com.au/
- **Skechers Australia**: https://www.skechers.com.au/
- **Vans Australia**: https://stag-vans-au.accentgra.com/ (staging)
- **Vans New Zealand**: https://stag-vans-nz.accentgra.com/ (staging)

### Test Scenarios
| Scenario | Description | GraphQL Operations |
|----------|-------------|-------------------|
| Login | Customer authentication | `generateCustomerToken`, `customer` |
| PDP | Product detail page | `products`, `productDetail` |
| Add to Cart | Cart operations | `addProductsToCart`, `cart` |
| Checkout | Order placement | `setShipping`, `setPayment`, `placeOrder` |
| Guest Place Order | Full 9-step guest checkout (Vans AU/NZ) | `createEmptyCart`, `addConfigurableProductsToCart`, `setShippingAddressesOnCart`, `setShippingMethodsOnCart`, `setBillingAddressOnCart`, `setPaymentMethodOnCart`, `placeOrder` |

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
- k6 v0.49+ ([Installation Guide](https://k6.io/docs/getting-started/installation/)) **OR** Docker (see Docker section below)

### Installation

#### Option 1: Local k6 Installation

```bash
# Install k6 (Windows)
winget install k6 --source winget
# OR
choco install k6
# OR
scoop install k6

# Clone the repository
git clone <repository-url>
cd k6-ecommerce-framework

# Install dependencies
npm install

# Build the tests
npm run build
```

#### Option 2: Docker (No k6 Installation Required)

```bash
# Clone the repository
git clone <repository-url>
cd k6-ecommerce-framework

# Install dependencies
npm install

# Build the tests
npm run build

# Run tests via Docker (see Docker section below)
```

### Running Tests

#### Using Local k6 Installation

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

#### Using Docker

Run tests using Docker without installing k6 locally:

```bash
# Basic load test
docker run --rm -v "%CD%:/app" grafana/k6 run /app/dist/tests/load.test.js

# Load test with 10 VUs for 2 minutes
docker run --rm -v "%CD%:/app" grafana/k6 run --vus 10 --duration 2m /app/dist/tests/load.test.js

# Platypus staging test
docker run --rm -v "%CD%:/app" -e SITE=platypus-au -e ENVIRONMENT=staging grafana/k6 run --vus 50 --duration 5m /app/dist/tests/load.test.js

# Skechers staging test
docker run --rm -v "%CD%:/app" -e SITE=skechers-au -e ENVIRONMENT=staging grafana/k6 run --vus 50 --duration 5m /app/dist/tests/load.test.js

# Dry run (no actual API calls)
docker run --rm -v "%CD%:/app" -e DRY_RUN=true grafana/k6 run --vus 1 --iterations 1 /app/dist/tests/load.test.js

# With dashboard output (mount output directory)
docker run --rm -v "%CD%:/app" -p 5665:5665 grafana/k6 run --out web-dashboard /app/dist/tests/load.test.js
```

**Windows CMD Troubleshooting:** If `%CD%` doesn't work, use the absolute path with forward slashes:
```bash
docker run --rm -v "E:/path/to/k6-ecommerce-framework:/app" grafana/k6 run /app/dist/tests/load.test.js
```

**PowerShell:** Replace `%CD%` with `${PWD}`:
```powershell
docker run --rm -v "${PWD}:/app" grafana/k6 run /app/dist/tests/load.test.js
```

**Linux/Mac:** Replace `%CD%` with `$(pwd)`:
```bash
docker run --rm -v "$(pwd):/app" grafana/k6 run /app/dist/tests/load.test.js
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SITE` | Target site (`platypus-au`, `skechers-au`, `vans-au`, `vans-nz`) | `platypus-au` |
| `ENVIRONMENT` | Environment (`staging` or `production`) | `staging` |
| `VUS` | Number of virtual users | varies |
| `DURATION` | Test duration | varies |
| `DRY_RUN` | Skip actual API calls | `false` |
| `ENABLE_PLACE_ORDER` | Enable order placement | `false` |
| `PAYMENT_METHOD` | Payment method code (e.g. `checkmo`) | `checkmo` |
| `PRODUCTION_CONFIRMED` | Confirm production testing | `false` |

### Example Commands

```bash
# Test Platypus staging with 10 VUs for 2 minutes
k6 run --env SITE=platypus-au --env ENVIRONMENT=staging --vus 10 --duration 2m dist/tests/smoke.test.js

# Test Skechers staging with custom duration
k6 run --env SITE=skechers-au --env ENVIRONMENT=staging --duration 5m dist/tests/load.test.js

# Run with k6 dashboard
npm run dashboard
# Then access http://localhost:5665
```

---

## 👟 Vans AU / NZ — Guest Place Order

Full 9-step guest checkout scenario against Vans AU and NZ Magento 2 staging stores.

### Quick Run

```bash
# Build first (required after any source change)
npm run build

# ── Vans Australia ───────────────────────────────────────────────────────────
# Single iteration validation (1 VU, 1 order)
k6 run \
  --env SITE=vans-au \
  --env ENABLE_PLACE_ORDER=true \
  --env PAYMENT_METHOD=checkmo \
  --vus 1 --iterations 1 \
  dist/tests/vans-place-order.test.js

# Full ramp-up load test (1 m ramp → 5 VU steady 8 m → 1 m ramp-down)
k6 run \
  --env SITE=vans-au \
  --env ENABLE_PLACE_ORDER=true \
  --env PAYMENT_METHOD=checkmo \
  dist/tests/vans-place-order.test.js

# ── Vans New Zealand ─────────────────────────────────────────────────────────
# Single iteration validation
k6 run \
  --env SITE=vans-nz \
  --env ENABLE_PLACE_ORDER=true \
  --env PAYMENT_METHOD=checkmo \
  --vus 1 --iterations 1 \
  dist/tests/vans-place-order.test.js

# Full ramp-up load test
k6 run \
  --env SITE=vans-nz \
  --env ENABLE_PLACE_ORDER=true \
  --env PAYMENT_METHOD=checkmo \
  dist/tests/vans-place-order.test.js

# ── Dry run (no actual orders placed) ────────────────────────────────────────
k6 run \
  --env SITE=vans-au \
  --env DRY_RUN=true \
  --vus 1 --iterations 1 \
  dist/tests/vans-place-order.test.js
```

> **Windows PowerShell**: replace the `\` line continuations with a single line or use backtick `` ` `` for continuation.

### PowerShell One-liners

```powershell
# Vans AU – validation
k6 run --env SITE=vans-au --env ENABLE_PLACE_ORDER=true --env PAYMENT_METHOD=checkmo --vus 1 --iterations 1 dist/tests/vans-place-order.test.js

# Vans NZ – validation
k6 run --env SITE=vans-nz --env ENABLE_PLACE_ORDER=true --env PAYMENT_METHOD=checkmo --vus 1 --iterations 1 dist/tests/vans-place-order.test.js

# Vans AU – full load test
k6 run --env SITE=vans-au --env ENABLE_PLACE_ORDER=true --env PAYMENT_METHOD=checkmo dist/tests/vans-place-order.test.js

# Vans NZ – full load test
k6 run --env SITE=vans-nz --env ENABLE_PLACE_ORDER=true --env PAYMENT_METHOD=checkmo dist/tests/vans-place-order.test.js
```

### Checkout Flow (9 Steps)

| Step | GraphQL Mutation | Notes |
|------|-----------------|-------|
| 1 | `createEmptyCart` | Creates guest cart; returns masked cart ID |
| 2 | `products` (query) | Resolves first in-stock configurable variant |
| 3 | `addConfigurableProductsToCart` | Adds parent + variant SKU |
| 4 | `setGuestEmailOnCart` | Assigns unique test email |
| 5 | `setShippingAddressesOnCart` | AU or NZ address; returns available methods |
| 6 | `setShippingMethodsOnCart` | Auto-selects first home-delivery method (skips Click & Collect) |
| 7 | `setBillingAddressOnCart` | Same address as shipping |
| 8 | `setPaymentMethodOnCart` | Uses `PAYMENT_METHOD` env var |
| 9 | `placeOrder` | Returns order number |

### Test Data & Endpoints

| Site | GraphQL endpoint | Address data | SKU pool |
|------|-----------------|--------------|----------|
| `vans-au` | `https://stag-vans-au.accentgra.com/graphql` | `src/data/addresses.json` (10 AU addresses) | 8 confirmed in-stock configurable SKUs |
| `vans-nz` | `https://stag-vans-nz.accentgra.com/graphql` | `src/data/addresses-nz.json` (8 NZ addresses) | 8 confirmed in-stock configurable SKUs |

### Key Implementation Notes

- `region_id` is **not** sent in the cart address — use the region string only (e.g. `NSW`). Region IDs are store-specific and cause validation errors.
- Click & Collect / in-store pickup carrier codes (`instore`, `storepickup`, `pickup`, `clickandcollect`) are filtered out when auto-selecting the shipping method.
- `createEmptyCart` (not `createGuestCart`) creates a guest cart on this Magento instance.
- Child/variant SKUs are numeric strings on this store (e.g. `82218`) — `resolveInStockVariant` handles this automatically.

## 📁 Project Structure

```
k6-ecommerce-framework/
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
│   │   ├── addresses.json     # AU shipping addresses (10 addresses)
│   │   └── addresses-nz.json  # NZ shipping addresses (8 addresses)
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
│   │   ├── place-order.ts     # Guest place-order (Vans AU/NZ)
│   │   └── index.ts
│   ├── tests/
│   │   ├── smoke.test.ts          # Smoke tests
│   │   ├── load.test.ts           # Load tests
│   │   ├── stress.test.ts         # Stress tests
│   │   ├── spike.test.ts          # Spike tests
│   │   ├── soak.test.ts           # Soak tests
│   │   └── vans-place-order.test.ts  # Vans AU/NZ guest checkout
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

##  Reporting

### k6 Dashboard

Run tests with the built-in dashboard:

```bash
npm run dashboard
```

Access at http://localhost:5665

### Grafana Cloud

#### Setup Steps

1. **Create Grafana Cloud Account**
   - Visit https://grafana.com/auth/sign-up/create-user
   - Select the free tier or appropriate plan
   - Complete account setup

2. **Get k6 Cloud API Token**
   - Log in to Grafana Cloud
   - Navigate to **Testing & Synthetic Monitoring** → **k6**
   - Click your profile → **Settings** → **API Token**
   - Click **Generate New Token**
   - Copy the token (it won't be shown again)

3. **Configure Token (Choose One Method)**

   **Method 1: Environment Variable (Recommended)**
   ```bash
   # Windows CMD
   set K6_CLOUD_TOKEN=your_token_here
   
   # Windows PowerShell
   $env:K6_CLOUD_TOKEN="your_token_here"
   
   # Linux/Mac
   export K6_CLOUD_TOKEN=your_token_here
   ```
   
   **Method 2: Config File**
   Create `~/.config/loadimpact/k6.json` (Windows: `%APPDATA%\loadimpact\k6.json`):
   ```json
   {
     "token": "your_token_here"
   }
   ```

4. **Run Cloud Tests**

   **Using Local k6:**
   ```bash
   # Basic cloud test
   npm run test:cloud
   
   # Site-specific cloud tests
   npm run test:cloud:platypus-au
   npm run test:cloud:skechers-au
   
   # Custom cloud test
   k6 cloud -e SITE=platypus-au -e ENVIRONMENT=staging dist/tests/load.test.js
   ```
   
   **Using Docker:**
   ```bash
   # Basic cloud test
   docker run --rm -v "${PWD}:/app" -e K6_CLOUD_TOKEN=your_token_here grafana/k6 cloud /app/dist/tests/load.test.js
   
   # Platypus staging
   docker run --rm -v "${PWD}:/app" -e K6_CLOUD_TOKEN=your_token_here -e SITE=platypus-au grafana/k6 cloud /app/dist/tests/load.test.js
   
   # Skechers staging
   docker run --rm -v "${PWD}:/app" -e K6_CLOUD_TOKEN=your_token_here -e SITE=skechers-au grafana/k6 cloud /app/dist/tests/load.test.js
   ```

5. **View Results**
   - Tests will appear in your Grafana Cloud k6 dashboard
   - Get real-time metrics and detailed analysis
   - Access at: https://app.k6.io/runs

#### Cloud Test Benefits
- 🌍 Global load zones (distributed testing)
- 📊 Advanced analytics and dashboards
- 📈 Historical trend analysis
- 🔔 Automated alerts and notifications
- 👥 Team collaboration features
- 💾 Long-term result storage

#### CI/CD Integration with Grafana Cloud

Add to GitHub Actions secrets:
- `K6_CLOUD_TOKEN`: Your Grafana Cloud API token

Tests will automatically stream results to Grafana Cloud when the token is configured.

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
Deployment guide