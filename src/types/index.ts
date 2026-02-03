/**
 * k6 eCommerce Load Testing Framework - Type Definitions
 * 
 * This file contains all TypeScript interfaces and types used throughout
 * the framework for type safety and code completion.
 */

// ============================================================================
// ENVIRONMENT & CONFIGURATION TYPES
// ============================================================================

/**
 * Supported site identifiers for the framework
 */
export type SiteIdentifier = 
  | 'platypus-au' 
  | 'platypus-nz' 
  | 'skechers-au' 
  | 'skechers-nz'
  | 'drmartens-au'
  | 'drmartens-nz'
  | 'vans-au'
  | 'vans-nz';

/**
 * Environment types for different testing stages
 */
export type EnvironmentType = 'development' | 'staging' | 'production';

/**
 * Site-specific configuration settings
 */
export interface SiteConfig {
  /** Unique identifier for the site */
  id: SiteIdentifier;
  /** Display name for reporting */
  name: string;
  /** Base URL for the website */
  baseUrl: string;
  /** GraphQL API endpoint */
  graphqlEndpoint: string;
  /** Store code for Magento multi-store setup */
  storeCode: string;
  /** Currency code (e.g., 'AUD') */
  currency: string;
  /** Default locale */
  locale: string;
  /** Rate limit (requests per second) */
  rateLimit: number;
  /** Custom headers for this site */
  headers?: Record<string, string>;
}

/**
 * Environment-specific configuration
 */
export interface EnvironmentConfig {
  /** Environment identifier */
  environment: EnvironmentType;
  /** Whether this is a production environment */
  isProduction: boolean;
  /** Enable dry run mode (no actual API calls) */
  dryRun: boolean;
  /** Debug mode for verbose logging */
  debug: boolean;
  /** Default timeout for requests (ms) */
  timeout: number;
  /** Maximum retries for failed requests */
  maxRetries: number;
  /** Think time range between requests [min, max] in seconds */
  thinkTime: [number, number];
}

/**
 * Performance thresholds configuration
 */
export interface ThresholdConfig {
  /** HTTP request duration p95 threshold (ms) */
  http_req_duration_p95: number;
  /** HTTP request duration p99 threshold (ms) */
  http_req_duration_p99: number;
  /** Maximum error rate (0-1) */
  http_req_failed_rate: number;
  /** Time to first byte threshold (ms) */
  http_req_waiting_p95: number;
  /** Custom scenario thresholds */
  scenarios?: Record<string, Record<string, number>>;
}

// ============================================================================
// GRAPHQL TYPES
// ============================================================================

/**
 * Standard GraphQL request structure
 */
export interface GraphQLRequest {
  /** GraphQL operation (query or mutation) */
  query: string;
  /** Variables for the operation */
  variables?: Record<string, unknown>;
  /** Operation name for debugging */
  operationName?: string;
}

/**
 * Standard GraphQL response structure
 */
export interface GraphQLResponse<T = unknown> {
  /** Response data */
  data?: T;
  /** GraphQL errors */
  errors?: GraphQLError[];
}

/**
 * GraphQL error structure
 */
export interface GraphQLError {
  /** Error message */
  message: string;
  /** Error locations in the query */
  locations?: Array<{
    line: number;
    column: number;
  }>;
  /** GraphQL path to the error */
  path?: Array<string | number>;
  /** Additional error extensions */
  extensions?: {
    category?: string;
    code?: string;
    [key: string]: unknown;
  };
}

/**
 * GraphQL client options
 */
export interface GraphQLClientOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Tags for k6 metrics */
  tags?: Record<string, string>;
}

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

/**
 * User credentials for authentication
 */
export interface UserCredentials {
  /** User email address */
  email: string;
  /** User password */
  password: string;
  /** Optional customer group */
  customerGroup?: string;
}

/**
 * Authentication token response
 */
export interface AuthToken {
  /** JWT or bearer token */
  token: string;
  /** Token expiration timestamp */
  expiresAt?: number;
  /** Token type (usually 'Bearer') */
  tokenType?: string;
}

/**
 * Authenticated session state
 */
export interface AuthSession {
  /** User credentials used for authentication */
  credentials: UserCredentials;
  /** Active authentication token */
  token: AuthToken;
  /** Customer ID from Magento */
  customerId?: string;
  /** Cart ID for the session */
  cartId?: string;
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
}

// ============================================================================
// PRODUCT TYPES
// ============================================================================

/**
 * Product data for test scenarios
 */
export interface ProductData {
  /** Product SKU */
  sku: string;
  /** URL key for the product */
  urlKey?: string;
  /** Product name */
  name?: string;
  /** Product category path */
  categoryPath?: string;
  /** Quantity to add to cart */
  quantity?: number;
  /** Selected options for configurable products */
  selectedOptions?: ProductOption[];
}

/**
 * Product option for configurable products
 */
export interface ProductOption {
  /** Option attribute code (e.g., 'size', 'color') */
  attributeCode: string;
  /** Selected value ID */
  valueId: string | number;
  /** Human-readable value label */
  valueLabel?: string;
}

/**
 * Product from GraphQL response
 */
export interface Product {
  /** Unique product ID */
  id: number;
  /** Product SKU */
  sku: string;
  /** Product name */
  name: string;
  /** Product type (simple, configurable, etc.) */
  __typename: string;
  /** URL key for routing */
  url_key: string;
  /** Stock status */
  stock_status: 'IN_STOCK' | 'OUT_OF_STOCK';
  /** Price range information */
  price_range: PriceRange;
  /** Configurable product options */
  configurable_options?: ConfigurableOption[];
  /** Configurable product variants */
  variants?: ProductVariant[];
}

/**
 * Price range structure from Magento GraphQL
 */
export interface PriceRange {
  minimum_price: {
    regular_price: Money;
    final_price: Money;
    discount?: {
      amount_off: number;
      percent_off: number;
    };
  };
  maximum_price?: {
    regular_price: Money;
    final_price: Money;
  };
}

/**
 * Money structure
 */
export interface Money {
  value: number;
  currency: string;
}

/**
 * Configurable product option
 */
export interface ConfigurableOption {
  attribute_code: string;
  attribute_id: string;
  label: string;
  values: Array<{
    value_index: number;
    label: string;
    swatch_data?: {
      value: string;
    };
  }>;
}

/**
 * Product variant for configurable products
 */
export interface ProductVariant {
  product: {
    id: number;
    sku: string;
    stock_status: 'IN_STOCK' | 'OUT_OF_STOCK';
  };
  attributes: Array<{
    code: string;
    value_index: number;
  }>;
}

// ============================================================================
// CART TYPES
// ============================================================================

/**
 * Cart data structure
 */
export interface Cart {
  /** Unique cart ID */
  id: string;
  /** Cart items */
  items: CartItem[];
  /** Cart totals */
  prices: CartPrices;
  /** Total quantity of items */
  total_quantity: number;
  /** Applied coupon codes */
  applied_coupons?: Array<{ code: string }>;
  /** Selected shipping addresses */
  shipping_addresses?: ShippingAddress[];
  /** Billing address */
  billing_address?: BillingAddress;
  /** Available payment methods */
  available_payment_methods?: PaymentMethod[];
  /** Selected payment method */
  selected_payment_method?: PaymentMethod;
}

/**
 * Cart item structure
 */
export interface CartItem {
  /** Cart item ID */
  id: string;
  /** Product information */
  product: {
    sku: string;
    name: string;
    __typename: string;
  };
  /** Item quantity */
  quantity: number;
  /** Item prices */
  prices: {
    price: Money;
    row_total: Money;
    row_total_including_tax: Money;
  };
  /** Configurable options for this item */
  configurable_options?: Array<{
    option_label: string;
    value_label: string;
  }>;
}

/**
 * Cart prices/totals
 */
export interface CartPrices {
  subtotal_excluding_tax: Money;
  subtotal_including_tax: Money;
  grand_total: Money;
  discounts?: Array<{
    amount: Money;
    label: string;
  }>;
  applied_taxes?: Array<{
    amount: Money;
    label: string;
  }>;
}

// ============================================================================
// CHECKOUT TYPES
// ============================================================================

/**
 * Shipping address structure
 */
export interface ShippingAddress {
  firstname: string;
  lastname: string;
  street: string[];
  city: string;
  region?: {
    code: string;
    label: string;
    region_id?: number;
  };
  postcode: string;
  country: {
    code: string;
    label: string;
  };
  telephone: string;
  company?: string;
  available_shipping_methods?: ShippingMethod[];
  selected_shipping_method?: ShippingMethod;
}

/**
 * Billing address structure
 */
export interface BillingAddress {
  firstname: string;
  lastname: string;
  street: string[];
  city: string;
  region?: {
    code: string;
    label: string;
    region_id?: number;
  };
  postcode: string;
  country: {
    code: string;
    label: string;
  };
  telephone: string;
  company?: string;
}

/**
 * Address input for mutations
 */
export interface AddressInput {
  firstname: string;
  lastname: string;
  street: string[];
  city: string;
  region?: string;
  region_id?: number;
  postcode: string;
  country_code: string;
  telephone: string;
  company?: string;
  save_in_address_book?: boolean;
}

/**
 * Shipping method structure
 */
export interface ShippingMethod {
  carrier_code: string;
  carrier_title: string;
  method_code: string;
  method_title: string;
  amount: Money;
  available: boolean;
}

/**
 * Payment method structure
 */
export interface PaymentMethod {
  code: string;
  title: string;
}

/**
 * Order result from placeOrder mutation
 */
export interface OrderResult {
  order_number: string;
  status?: string;
}

/**
 * Test checkout data for placing orders
 */
export interface CheckoutData {
  /** Shipping address */
  shippingAddress: AddressInput;
  /** Billing address (optional, defaults to shipping) */
  billingAddress?: AddressInput;
  /** Preferred shipping method code */
  shippingMethodCode?: string;
  /** Preferred carrier code */
  shippingCarrierCode?: string;
  /** Payment method code */
  paymentMethodCode: string;
  /** Coupon code to apply */
  couponCode?: string;
}

// ============================================================================
// TEST DATA TYPES
// ============================================================================

/**
 * Test user data from CSV/JSON
 */
export interface TestUser extends UserCredentials {
  /** Unique identifier for the test user */
  id: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** User type for tagging */
  userType?: 'guest' | 'registered' | 'vip';
}

/**
 * Test product data from CSV/JSON
 */
export interface TestProduct extends ProductData {
  /** Unique identifier */
  id: string;
  /** Product type */
  productType?: 'simple' | 'configurable' | 'bundle';
  /** Expected price range for validation */
  expectedPrice?: {
    min: number;
    max: number;
  };
}

/**
 * Test address data from CSV/JSON
 */
export interface TestAddress extends AddressInput {
  /** Unique identifier */
  id: string;
  /** Address label (e.g., 'Sydney Metro', 'Rural NSW') */
  label?: string;
  /** Whether this is a valid delivery address */
  isDeliverable?: boolean;
}

// ============================================================================
// SCENARIO TYPES
// ============================================================================

/**
 * Scenario execution context
 */
export interface ScenarioContext {
  /** Current virtual user ID */
  vuId: number;
  /** Current iteration number */
  iteration: number;
  /** Scenario name */
  scenarioName: string;
  /** Site being tested */
  site: SiteIdentifier;
  /** Active session (if authenticated) */
  session?: AuthSession;
  /** Current cart ID */
  cartId?: string;
  /** Collected metrics */
  metrics: Map<string, number>;
}

/**
 * Scenario result for reporting
 */
export interface ScenarioResult {
  /** Whether the scenario succeeded */
  success: boolean;
  /** Scenario name */
  scenario: string;
  /** Execution duration in ms */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Additional data from the scenario */
  data?: Record<string, unknown>;
}

// ============================================================================
// METRICS TYPES
// ============================================================================

/**
 * Custom metric definition
 */
export interface CustomMetric {
  /** Metric name */
  name: string;
  /** Metric type */
  type: 'counter' | 'gauge' | 'rate' | 'trend';
  /** Description for documentation */
  description: string;
  /** Unit of measurement */
  unit?: string;
  /** Tags for filtering */
  tags?: Record<string, string>;
}

/**
 * Business KPI metric
 */
export interface BusinessKPI {
  /** KPI identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Target value */
  target: number;
  /** Actual measured value */
  actual?: number;
  /** Unit of measurement */
  unit: string;
  /** Whether target was met */
  passed?: boolean;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error information */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** Response time in ms */
  responseTime: number;
  /** HTTP status code */
  statusCode: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Initial delay between retries (ms) */
  initialDelay: number;
  /** Maximum delay between retries (ms) */
  maxDelay: number;
  /** Delay multiplier for exponential backoff */
  backoffMultiplier: number;
  /** HTTP status codes to retry on */
  retryableStatuses: number[];
}

/**
 * Data rotation strategy
 */
export type DataRotationStrategy = 'sequential' | 'random' | 'unique';

/**
 * CSV parser options
 */
export interface CSVParserOptions {
  /** Field delimiter */
  delimiter?: string;
  /** Whether first row is header */
  hasHeader?: boolean;
  /** Column mapping */
  columns?: string[];
  /** Skip empty lines */
  skipEmpty?: boolean;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Include timestamps */
  timestamps: boolean;
  /** Include VU information */
  includeVU: boolean;
  /** Pretty print objects */
  prettyPrint: boolean;
}
