# Framework Architecture

This document describes the architectural decisions and design patterns used in the k6 eCommerce Load Testing Framework.

## 🏗 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Test Execution Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ smoke.test  │  │ load.test   │  │ stress.test │  │ soak.test   │   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │
└─────────┼────────────────┼────────────────┼────────────────┼──────────┘
          │                │                │                │
          └────────────────┴────────┬───────┴────────────────┘
                                    │
┌───────────────────────────────────┼───────────────────────────────────┐
│                        Scenario Layer                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Login     │  │    PDP      │  │ Add to Cart │  │  Checkout   │  │
│  │  Scenario   │  │  Scenario   │  │  Scenario   │  │  Scenario   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
└─────────┼────────────────┼────────────────┼────────────────┼──────────┘
          │                │                │                │
          └────────────────┴────────┬───────┴────────────────┘
                                    │
┌───────────────────────────────────┼───────────────────────────────────┐
│                         Library Layer                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐  │
│  │ GraphQL       │  │ Auth          │  │ Data                      │  │
│  │ Client        │  │ Manager       │  │ Provider                  │  │
│  └───────────────┘  └───────────────┘  └───────────────────────────┘  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐  │
│  │ Logger        │  │ Metrics       │  │ Utils                     │  │
│  └───────────────┘  └───────────────┘  └───────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────┼───────────────────────────────────┐
│                      Configuration Layer                               │
│  ┌───────────────────────┐  ┌─────────────────────────────────────┐   │
│  │ Config Manager        │  │ Environment Configs                 │   │
│  │ (Singleton)           │  │ (staging.json, production.json)     │   │
│  └───────────────────────┘  └─────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

## 🎯 Design Principles

### 1. Separation of Concerns

Each layer has a distinct responsibility:

- **Test Layer**: Orchestrates scenarios, defines options and thresholds
- **Scenario Layer**: Implements user journeys with business logic
- **Library Layer**: Provides reusable utilities and clients
- **Configuration Layer**: Manages site and environment settings

### 2. Type Safety

Full TypeScript implementation with comprehensive type definitions:

```typescript
// Comprehensive type system
interface SiteConfig {
  name: string;
  baseUrl: string;
  graphqlEndpoint: string;
  storeCode: string;
  currency: string;
  // ...
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}
```

### 3. Singleton Pattern

Configuration and client instances use singleton pattern to prevent resource leaks:

```typescript
class ConfigManager {
  private static instance: ConfigManager;
  
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }
}
```

### 4. Memory-Efficient Data Loading

Using k6's SharedArray for test data:

```typescript
const users = new SharedArray('users', () => {
  return JSON.parse(open('./data/users.json'));
});
```

Benefits:
- Data loaded once, shared across VUs
- Reduces memory footprint
- Supports large datasets

## 📦 Module Breakdown

### GraphQL Client (`lib/graphql-client.ts`)

Central client for all GraphQL operations:

```typescript
class GraphQLClient {
  // Configuration
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  
  // Features
  - Request/Response handling
  - Automatic retries with backoff
  - Token management
  - Custom metrics collection
  - Error parsing
}
```

**Key Features:**
- Exponential backoff retry (3 attempts)
- Automatic token refresh
- Request tagging for metrics
- Timeout handling

### Auth Manager (`lib/auth-manager.ts`)

Handles customer authentication and guest carts:

```typescript
class AuthManager {
  login(email: string, password: string): AuthState
  logout(): void
  refreshToken(): AuthState
  isAuthenticated(): boolean
}

class GuestCartManager {
  createCart(): string
  getCart(cartId: string): Cart
  addProduct(cartId: string, product: Product): Cart
}
```

### Data Provider (`lib/data-provider.ts`)

Flexible data loading with multiple strategies:

```typescript
class DataProvider<T> {
  // Rotation strategies
  sequential(): T   // Round-robin
  random(): T       // Random selection
  unique(): T       // No repeats until exhausted
  
  // Data formats
  - JSON via SharedArray
  - CSV via papaparse
}
```

### Config Manager (`lib/config-manager.ts`)

Centralized configuration management:

```typescript
class ConfigManager {
  getSiteConfig(site: string): SiteConfig
  getEnvironmentConfig(env: string): EnvironmentConfig
  validateSafetyChecks(): boolean
  
  // Safety features
  - Production guards
  - Rate limiting
  - VU limits
}
```

### Metrics (`lib/metrics.ts`)

Custom k6 metrics for business KPIs:

```typescript
// Scenario metrics
export const loginDuration = new Trend('login_duration', true);
export const pdpDuration = new Trend('pdp_duration', true);

// Business metrics
export const ordersPlaced = new Counter('business_orders_placed');
export const cartValue = new Trend('business_cart_value');

// GraphQL metrics
export const queryDuration = new Trend('graphql_query_duration', true);
export const mutationDuration = new Trend('graphql_mutation_duration', true);
```

## 🔄 Request Flow

### Authentication Flow

```
┌──────────┐     ┌─────────────┐     ┌───────────────┐     ┌──────────┐
│   Test   │────▶│ AuthManager │────▶│ GraphQLClient │────▶│   API    │
│          │     │             │     │               │     │          │
│          │◀────│  Token      │◀────│   Response    │◀────│   JWT    │
└──────────┘     └─────────────┘     └───────────────┘     └──────────┘
```

### Scenario Execution Flow

```
┌──────────┐     ┌──────────────┐     ┌───────────────┐
│   Test   │────▶│   Scenario   │────▶│ DataProvider  │
│  (VU)    │     │   (login)    │     │ (get user)    │
└──────────┘     └──────┬───────┘     └───────────────┘
                        │
                        ▼
                ┌───────────────┐     ┌───────────────┐
                │ GraphQLClient │────▶│   Metrics     │
                │ (mutation)    │     │ (record)      │
                └───────────────┘     └───────────────┘
```

## 🔐 Safety Architecture

### Production Protection Layers

```
Layer 1: Environment Variable Check
    └── PRODUCTION_CONFIRMED must be "true"

Layer 2: Configuration Validation
    └── ConfigManager.validateSafetyChecks()

Layer 3: Feature Flags
    └── features.enablePlaceOrder must be true

Layer 4: Dry Run Mode
    └── DRY_RUN=true skips mutations

Layer 5: Rate Limiting
    └── Configurable requests per second
```

### Implementation

```typescript
export function placeOrder(cart: Cart): Order {
  // Safety check 1: Environment
  if (__ENV.ENVIRONMENT === 'production') {
    if (__ENV.PRODUCTION_CONFIRMED !== 'true') {
      throw new Error('Production testing requires PRODUCTION_CONFIRMED=true');
    }
  }
  
  // Safety check 2: Feature flag
  if (__ENV.ENABLE_PLACE_ORDER !== 'true') {
    Logger.warn('Order placement disabled - skipping');
    return mockOrder();
  }
  
  // Safety check 3: Dry run
  if (__ENV.DRY_RUN === 'true') {
    Logger.info('DRY_RUN mode - simulating order');
    return mockOrder();
  }
  
  // Actual order placement
  return executeOrder(cart);
}
```

## 📊 Metrics Architecture

### Metric Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| HTTP | Request-level | Duration, failure rate |
| GraphQL | Operation-level | Query/mutation timing |
| Scenario | Journey-level | Login, PDP, checkout time |
| Business | KPI-level | Orders, cart value |

### Threshold Configuration

```typescript
thresholds: {
  // HTTP metrics
  http_req_duration: ['p(95)<800', 'p(99)<2000'],
  http_req_failed: ['rate<0.01'],
  
  // GraphQL metrics
  graphql_query_duration: ['p(95)<500'],
  graphql_mutation_duration: ['p(95)<1000'],
  graphql_errors: ['count<10'],
  
  // Scenario metrics
  login_duration: ['p(95)<3000'],
  pdp_duration: ['p(95)<2000'],
  checkout_duration: ['p(95)<5000'],
  
  // Business metrics
  business_conversion_rate: ['value>0.5']
}
```

## 🔧 Build Pipeline

### Webpack Configuration

```
TypeScript Source
       │
       ▼
┌──────────────┐
│   ts-loader  │ ──▶ Type checking
│   + babel    │ ──▶ ES2020 transpilation
└──────────────┘
       │
       ▼
┌──────────────┐
│   Resolve    │ ──▶ Path aliases (@lib, @config, etc.)
│   Aliases    │
└──────────────┘
       │
       ▼
┌──────────────┐
│    Output    │ ──▶ dist/tests/*.js
│              │ ──▶ dist/data/* (copied)
└──────────────┘
```

### Path Aliases

| Alias | Path |
|-------|------|
| `@config` | `src/config` |
| `@lib` | `src/lib` |
| `@scenarios` | `src/scenarios` |
| `@data` | `src/data` |
| `@tests` | `src/tests` |
| `@types` | `src/types` |

## 🔄 Extensibility

### Adding New Sites

1. Add site config to `config-manager.ts`:

```typescript
const siteConfigs = {
  // ...existing
  newsite: {
    name: 'New Site',
    baseUrl: 'https://newsite.com',
    graphqlEndpoint: 'https://newsite.com/graphql',
    // ...
  }
};
```

2. Create product data file:

```json
// src/data/products-newsite.json
[
  { "sku": "NEWSITE-001", "name": "Product 1" }
]
```

### Adding New Scenarios

1. Create scenario file:

```typescript
// src/scenarios/wishlist.ts
export function addToWishlist(productSku: string): WishlistItem {
  const mutation = `
    mutation AddToWishlist($sku: String!) {
      addProductsToWishlist(input: { sku: $sku }) {
        wishlist { id items { id product { sku } } }
      }
    }
  `;
  // ...
}
```

2. Export from index:

```typescript
// src/scenarios/index.ts
export * from './wishlist';
```

3. Use in tests:

```typescript
import { addToWishlist } from '@scenarios';

export function wishlistScenario() {
  addToWishlist(product.sku);
}
```

### Adding New Test Types

Create new test file following the pattern:

```typescript
// src/tests/peak.test.ts
import { Options } from 'k6/options';

export const options: Options = {
  scenarios: {
    peak: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      preAllocatedVUs: 100,
      stages: [
        { duration: '1m', target: 500 }, // Ramp to peak
        { duration: '5m', target: 500 }, // Hold peak
        { duration: '1m', target: 0 },   // Ramp down
      ],
    },
  },
  thresholds: {
    // Peak-specific thresholds
  },
};
```

## 📈 Performance Considerations

### Memory Management

- Use `SharedArray` for all test data
- Avoid creating objects in hot paths
- Reuse GraphQL client instances

### Request Optimization

- Connection pooling via k6
- Keep-alive connections
- Compression enabled

### Parallelization

- Scenarios run concurrently
- Data providers are thread-safe
- Metrics aggregated automatically
