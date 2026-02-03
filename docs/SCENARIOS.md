# Test Scenarios Documentation

This document provides detailed documentation for each test scenario in the k6 eCommerce Load Testing Framework.

## 📋 Scenario Overview

| Scenario | Priority | Duration | GraphQL Operations | Data Required |
|----------|----------|----------|-------------------|---------------|
| Login | High | ~2-3s | `generateCustomerToken`, `customer` | User credentials |
| PDP | High | ~1-2s | `products`, `productDetail` | Product SKUs |
| Add to Cart | High | ~2-3s | `createEmptyCart`, `addProductsToCart` | Products, Cart ID |
| Checkout | Critical | ~5-10s | Multiple shipping/payment/order | Full cart, Address |

## 🔐 Login Scenario

### Purpose
Validates customer authentication flow including token generation and session management.

### GraphQL Operations

#### 1. Generate Customer Token
```graphql
mutation GenerateCustomerToken($email: String!, $password: String!) {
  generateCustomerToken(email: $email, password: $password) {
    token
  }
}
```

#### 2. Get Customer Info
```graphql
query GetCustomer {
  customer {
    id
    firstname
    lastname
    email
    addresses {
      id
      street
      city
      region { region_code }
      postcode
      country_code
      telephone
    }
  }
}
```

### Flow Diagram

```
┌─────────────────┐
│  Start Login    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Get User Data   │ ◀── DataProvider (users.json)
│ (email/pass)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ generateCustomer│
│ Token mutation  │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Success │
    └────┬────┘
         │
         ▼
┌─────────────────┐
│ Store Token in  │
│ AuthManager     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Query customer  │ (optional validation)
│ info            │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  End Login      │
│ (return state)  │
└─────────────────┘
```

### Test Data Requirements

**users.json:**
```json
{
  "users": [
    {
      "email": "test1@example.com",
      "password": "Test123!",
      "firstName": "John",
      "lastName": "Doe"
    }
  ]
}
```

### Expected Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| `login_duration` | p95 < 3000ms | Full login flow |
| `graphql_mutation_duration` | p95 < 1000ms | Token generation |
| Error rate | < 1% | Invalid credentials excluded |

### Usage Example

```typescript
import { customerLogin } from '@scenarios';
import { DataProvider } from '@lib';

const users = new DataProvider(usersData);

export default function() {
  const user = users.random();
  const authState = customerLogin(user.email, user.password);
  
  check(authState, {
    'login successful': (state) => state.isAuthenticated,
    'has token': (state) => state.token !== null,
  });
}
```

---

## 🛍 Product Detail Page (PDP) Scenario

### Purpose
Simulates users browsing product detail pages, including fetching product information and configurable product options.

### GraphQL Operations

#### 1. Get Products List
```graphql
query GetProducts($search: String, $pageSize: Int, $currentPage: Int) {
  products(
    search: $search
    pageSize: $pageSize
    currentPage: $currentPage
  ) {
    items {
      id
      sku
      name
      price_range {
        minimum_price {
          regular_price { value currency }
          final_price { value currency }
        }
      }
      ... on ConfigurableProduct {
        configurable_options {
          attribute_code
          label
          values { value_index label }
        }
        variants {
          product { sku name }
          attributes { code value_index }
        }
      }
    }
    total_count
  }
}
```

#### 2. Get Product Detail
```graphql
query GetProductDetail($sku: String!) {
  products(filter: { sku: { eq: $sku } }) {
    items {
      id
      sku
      name
      description { html }
      short_description { html }
      image { url label }
      media_gallery {
        url
        label
        position
      }
      price_range {
        minimum_price {
          regular_price { value currency }
          final_price { value currency }
          discount { amount_off percent_off }
        }
      }
      stock_status
      categories {
        id
        name
        url_path
      }
      ... on ConfigurableProduct {
        configurable_options {
          attribute_code
          label
          values {
            value_index
            label
            swatch_data { value }
          }
        }
      }
    }
  }
}
```

### Flow Diagram

```
┌─────────────────┐
│   Start PDP     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Get Product SKU │ ◀── DataProvider (products-{site}.json)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Query product   │
│ detail by SKU   │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Success │
    └────┬────┘
         │
         ▼
┌─────────────────┐
│ Parse product   │
│ data & variants │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Record metrics  │
│ (pdp_duration)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Return product  │
│ object          │
└─────────────────┘
```

### Test Data Requirements

**products-platypus.json:**
```json
{
  "products": [
    {
      "sku": "PLAT-001",
      "name": "Nike Air Max 90",
      "type": "configurable",
      "category": "mens-shoes"
    }
  ]
}
```

### Expected Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| `pdp_duration` | p95 < 2000ms | Full PDP load |
| `graphql_query_duration` | p95 < 500ms | Product query |
| Image load time | Excluded | GraphQL only |

### Configurable Product Handling

```typescript
// The PDP scenario handles both simple and configurable products
const product = viewProductDetail(sku);

if (product.type === 'ConfigurableProduct') {
  // Extract variant options
  const options = product.configurable_options;
  const variants = product.variants;
  
  // Select random variant for cart operations
  const selectedVariant = selectRandomVariant(variants);
}
```

---

## 🛒 Add to Cart Scenario

### Purpose
Tests cart operations including cart creation, product addition, and cart state management.

### GraphQL Operations

#### 1. Create Empty Cart
```graphql
mutation CreateEmptyCart {
  createEmptyCart
}
```

#### 2. Add Simple Product to Cart
```graphql
mutation AddProductsToCart($cartId: String!, $cartItems: [CartItemInput!]!) {
  addProductsToCart(
    cartId: $cartId
    cartItems: $cartItems
  ) {
    cart {
      id
      items {
        id
        product { sku name }
        quantity
        prices {
          row_total { value currency }
        }
      }
      prices {
        grand_total { value currency }
        subtotal_excluding_tax { value currency }
      }
    }
    user_errors {
      code
      message
    }
  }
}
```

#### 3. Add Configurable Product to Cart
```graphql
mutation AddConfigurableToCart(
  $cartId: String!
  $parentSku: String!
  $quantity: Float!
  $selectedOptions: [String!]!
) {
  addProductsToCart(
    cartId: $cartId
    cartItems: [
      {
        sku: $parentSku
        quantity: $quantity
        selected_options: $selectedOptions
      }
    ]
  ) {
    cart {
      id
      items { ... }
    }
  }
}
```

#### 4. Get Cart Contents
```graphql
query GetCart($cartId: String!) {
  cart(cart_id: $cartId) {
    id
    email
    items {
      id
      product {
        sku
        name
        thumbnail { url }
      }
      quantity
      prices {
        row_total { value currency }
        row_total_including_tax { value currency }
      }
    }
    prices {
      grand_total { value currency }
      subtotal_excluding_tax { value currency }
      subtotal_including_tax { value currency }
    }
    shipping_addresses {
      available_shipping_methods {
        carrier_code
        method_code
        carrier_title
        method_title
        amount { value currency }
      }
    }
  }
}
```

### Flow Diagram

```
┌─────────────────┐
│  Start Cart     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check auth      │
│ state           │
└────────┬────────┘
         │
    ┌────┴────────────┐
    │                 │
    ▼                 ▼
┌────────┐      ┌──────────┐
│ Guest  │      │ Customer │
│ Cart   │      │ Cart     │
└───┬────┘      └────┬─────┘
    │                │
    ▼                ▼
┌─────────────────────────┐
│ createEmptyCart or      │
│ use customer cart       │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Get product data        │ ◀── DataProvider
│ (SKU, options)          │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ addProductsToCart       │
│ mutation                │
└────────────┬────────────┘
             │
        ┌────┴────┐
        │ Success │
        └────┬────┘
             │
             ▼
┌─────────────────────────┐
│ Validate cart response  │
│ Record metrics          │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Return cart state       │
└─────────────────────────┘
```

### Test Data Requirements

**products-platypus.json:**
```json
{
  "products": [
    {
      "sku": "PLAT-001",
      "name": "Nike Air Max 90",
      "type": "configurable",
      "options": {
        "size": "US 10",
        "color": "Black"
      }
    }
  ]
}
```

### Expected Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| `add_to_cart_duration` | p95 < 3000ms | Full add flow |
| `graphql_mutation_duration` | p95 < 1000ms | Cart mutation |
| `business_cart_value` | Tracked | Cart totals |

### Error Handling

```typescript
// Handle common cart errors
const result = addProductToCart(cartId, product);

if (result.user_errors?.length > 0) {
  for (const error of result.user_errors) {
    switch (error.code) {
      case 'PRODUCT_NOT_FOUND':
        Logger.warn(`Product ${product.sku} not found`);
        break;
      case 'INSUFFICIENT_STOCK':
        Logger.warn(`Product ${product.sku} out of stock`);
        break;
      case 'UNDEFINED':
        Logger.error(`Unknown error: ${error.message}`);
        break;
    }
  }
}
```

---

## 💳 Checkout Scenario

### Purpose
Tests the complete checkout flow including shipping address, shipping method selection, payment method, and order placement.

### ⚠️ Safety Warning

```
╔═══════════════════════════════════════════════════════════════╗
║                    ⚠️  SAFETY WARNING  ⚠️                      ║
╠═══════════════════════════════════════════════════════════════╣
║  This scenario can CREATE REAL ORDERS.                        ║
║                                                                ║
║  Production usage requires:                                    ║
║  • ENABLE_PLACE_ORDER=true                                     ║
║  • PRODUCTION_CONFIRMED=true (for production env)              ║
║                                                                ║
║  Safeguards:                                                   ║
║  • Order placement is DISABLED by default                      ║
║  • DRY_RUN mode simulates without actual API calls             ║
║  • Rate limiting prevents excessive orders                     ║
╚═══════════════════════════════════════════════════════════════╝
```

### GraphQL Operations

#### 1. Set Shipping Address
```graphql
mutation SetShippingAddress($cartId: String!, $address: ShippingAddressInput!) {
  setShippingAddressesOnCart(
    input: {
      cart_id: $cartId
      shipping_addresses: [$address]
    }
  ) {
    cart {
      shipping_addresses {
        firstname
        lastname
        street
        city
        region { code label }
        postcode
        country { code label }
        telephone
        available_shipping_methods {
          carrier_code
          method_code
          carrier_title
          method_title
          amount { value currency }
        }
      }
    }
  }
}
```

#### 2. Set Shipping Method
```graphql
mutation SetShippingMethod(
  $cartId: String!
  $carrierCode: String!
  $methodCode: String!
) {
  setShippingMethodsOnCart(
    input: {
      cart_id: $cartId
      shipping_methods: [
        {
          carrier_code: $carrierCode
          method_code: $methodCode
        }
      ]
    }
  ) {
    cart {
      shipping_addresses {
        selected_shipping_method {
          carrier_code
          method_code
          carrier_title
          method_title
          amount { value currency }
        }
      }
    }
  }
}
```

#### 3. Set Billing Address
```graphql
mutation SetBillingAddress($cartId: String!, $address: BillingAddressInput!) {
  setBillingAddressOnCart(
    input: {
      cart_id: $cartId
      billing_address: {
        address: $address
        same_as_shipping: true
      }
    }
  ) {
    cart {
      billing_address {
        firstname
        lastname
        street
        city
        region { code }
        postcode
        country { code }
      }
    }
  }
}
```

#### 4. Set Payment Method
```graphql
mutation SetPaymentMethod($cartId: String!, $paymentMethod: PaymentMethodInput!) {
  setPaymentMethodOnCart(
    input: {
      cart_id: $cartId
      payment_method: $paymentMethod
    }
  ) {
    cart {
      selected_payment_method {
        code
        title
      }
    }
  }
}
```

#### 5. Set Guest Email
```graphql
mutation SetGuestEmail($cartId: String!, $email: String!) {
  setGuestEmailOnCart(
    input: {
      cart_id: $cartId
      email: $email
    }
  ) {
    cart {
      email
    }
  }
}
```

#### 6. Place Order
```graphql
mutation PlaceOrder($cartId: String!) {
  placeOrder(input: { cart_id: $cartId }) {
    order {
      order_number
    }
  }
}
```

### Flow Diagram

```
┌─────────────────────────────┐
│      Start Checkout         │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Validate cart has items     │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Set shipping address        │ ◀── DataProvider (addresses.json)
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Get available shipping      │
│ methods                     │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Select shipping method      │
│ (cheapest or configured)    │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Set billing address         │
│ (same as shipping)          │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Set payment method          │
│ (checkmo for test)          │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Set guest email (if guest)  │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ ⚠️  Safety check:            │
│ ENABLE_PLACE_ORDER?         │
└─────────────┬───────────────┘
              │
        ┌─────┴─────┐
        │           │
        ▼           ▼
    ┌───────┐  ┌─────────┐
    │ false │  │  true   │
    └───┬───┘  └────┬────┘
        │           │
        ▼           ▼
┌───────────┐  ┌──────────────┐
│ Skip      │  │ Place order  │
│ (log)     │  │ mutation     │
└───────────┘  └──────┬───────┘
                      │
                      ▼
              ┌──────────────┐
              │ Record order │
              │ number       │
              └──────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │ End Checkout │
              └──────────────┘
```

### Test Data Requirements

**addresses.json:**
```json
{
  "addresses": [
    {
      "firstName": "John",
      "lastName": "Doe",
      "street": ["123 Test Street"],
      "city": "Sydney",
      "region": "NSW",
      "postcode": "2000",
      "countryCode": "AU",
      "telephone": "+61412345678"
    }
  ]
}
```

### Expected Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| `checkout_duration` | p95 < 5000ms | Full checkout |
| `place_order_duration` | p95 < 3000ms | Order placement |
| `business_orders_placed` | Counted | Successful orders |

### Payment Methods

| Code | Description | Use Case |
|------|-------------|----------|
| `checkmo` | Check/Money Order | Default test payment |
| `free` | Free (zero total) | Coupon testing |
| `purchaseorder` | Purchase Order | B2B testing |

### Usage Example

```typescript
import { fullCheckout } from '@scenarios';

export default function() {
  // Ensure cart has items first
  const cartId = getOrCreateCart();
  addProductToCart(cartId, product);
  
  // Run checkout (order placement controlled by env)
  const result = fullCheckout(cartId, address);
  
  check(result, {
    'checkout completed': (r) => r.success,
    'has order number': (r) => r.orderNumber !== null,
  });
}
```

---

## 🔗 Scenario Combinations

### Full User Journey

```typescript
// Complete user flow: Browse → Login → Add to Cart → Checkout
export function userJourney() {
  // 1. Browse products
  const product = viewProductDetail(randomProduct.sku);
  sleep(randomIntBetween(2, 5));
  
  // 2. Login
  const auth = customerLogin(user.email, user.password);
  sleep(randomIntBetween(1, 3));
  
  // 3. Add to cart
  const cart = addToCart(auth.cartId, product);
  sleep(randomIntBetween(1, 3));
  
  // 4. Checkout
  const order = fullCheckout(cart.id, address);
  
  return { auth, cart, order };
}
```

### Guest User Journey

```typescript
// Guest flow without login
export function guestJourney() {
  // 1. Browse products
  const product = viewProductDetail(randomProduct.sku);
  
  // 2. Create guest cart
  const cartId = createGuestCart();
  
  // 3. Add to cart
  const cart = addToCart(cartId, product);
  
  // 4. Guest checkout with email
  const order = guestCheckout(cart.id, address, guestEmail);
  
  return { cart, order };
}
```

---

## 📊 Scenario Weights

Test scenarios can be weighted to simulate realistic traffic patterns:

```typescript
export const options: Options = {
  scenarios: {
    pdp_browsing: {
      executor: 'constant-vus',
      vus: 50,
      duration: '10m',
      exec: 'pdpScenario',
    },
    add_to_cart: {
      executor: 'constant-vus',
      vus: 20,
      duration: '10m',
      exec: 'cartScenario',
    },
    checkout: {
      executor: 'constant-vus',
      vus: 10,
      duration: '10m',
      exec: 'checkoutScenario',
    },
  },
};

// Resulting traffic distribution:
// - 62.5% browsing (50/80)
// - 25% cart operations (20/80)
// - 12.5% checkout (10/80)
```

This mirrors typical eCommerce conversion funnels where many users browse, fewer add to cart, and fewer still complete checkout.
