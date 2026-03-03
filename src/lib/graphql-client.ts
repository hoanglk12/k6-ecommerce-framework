/**
 * GraphQL Client Module
 * 
 * A robust, reusable GraphQL client for k6 load testing with:
 * - Automatic retry logic with exponential backoff
 * - Comprehensive error handling for GraphQL and HTTP errors
 * - Request/response logging for debugging
 * - Metrics tagging for detailed analysis
 * - Token-based authentication support
 */

import http, { RefinedResponse, ResponseType } from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import {
  GraphQLRequest,
  GraphQLResponse,
  GraphQLError,
  GraphQLClientOptions,
  SiteConfig,
  RetryConfig,
} from '../types';
import { Logger } from './logger';
import { recordTimingMetrics } from './metrics';

// ============================================================================
// CUSTOM METRICS
// ============================================================================

/** Track GraphQL request duration */
const graphqlDuration = new Trend('graphql_request_duration', true);
/** Track GraphQL error rate */
const graphqlErrors = new Rate('graphql_errors');
/** Count total GraphQL requests */
const graphqlRequests = new Counter('graphql_requests_total');
/** Track GraphQL retry attempts */
const graphqlRetries = new Counter('graphql_retries_total');

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000,    // 10 seconds
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

const DEFAULT_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// GRAPHQL CLIENT CLASS
// ============================================================================

/**
 * GraphQL Client for making queries and mutations against Magento/Adobe Commerce
 */
export class GraphQLClient {
  private readonly endpoint: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly retryConfig: RetryConfig;
  private readonly timeout: number;
  private readonly logger: Logger;
  private authToken: string | null = null;

  /**
   * Creates a new GraphQL client instance
   * 
   * @param siteConfig - Site configuration with endpoint and headers
   * @param options - Optional client configuration
   */
  constructor(
    private readonly siteConfig: SiteConfig,
    private readonly options: GraphQLClientOptions = {}
  ) {
    this.endpoint = siteConfig.graphqlEndpoint;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG };
    
    if (options.retries !== undefined) {
      this.retryConfig.maxRetries = options.retries;
    }

    // Build default headers
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Store': siteConfig.storeCode,
      'X-Requested-With': 'XMLHttpRequest',
      ...siteConfig.headers,
      ...options.headers,
    };

    this.logger = new Logger({
      level: 'info',
      timestamps: true,
      includeVU: true,
      prettyPrint: false,
    });
  }

  /**
   * Set the authentication token for subsequent requests
   * 
   * @param token - Bearer token from customer authentication
   */
  setAuthToken(token: string): void {
    this.authToken = token;
    this.logger.debug(`Auth token set: ${token.substring(0, 10)}...`);
  }

  /**
   * Clear the authentication token
   */
  clearAuthToken(): void {
    this.authToken = null;
    this.logger.debug('Auth token cleared');
  }

  /**
   * Get current authentication token
   */
  getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Execute a GraphQL query
   * 
   * @param query - GraphQL query string
   * @param variables - Query variables
   * @param options - Request-specific options
   * @returns Typed GraphQL response
   */
  query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    options?: GraphQLClientOptions
  ): GraphQLResponse<T> {
    return this.execute<T>({ query, variables }, options);
  }

  /**
   * Execute a GraphQL mutation
   * 
   * @param mutation - GraphQL mutation string
   * @param variables - Mutation variables
   * @param options - Request-specific options
   * @returns Typed GraphQL response
   */
  mutate<T = unknown>(
    mutation: string,
    variables?: Record<string, unknown>,
    options?: GraphQLClientOptions
  ): GraphQLResponse<T> {
    return this.execute<T>({ query: mutation, variables }, options);
  }

  /**
   * Execute a GraphQL request with retry logic
   * 
   * @param request - GraphQL request object
   * @param options - Request-specific options
   * @returns Typed GraphQL response
   */
  execute<T = unknown>(
    request: GraphQLRequest,
    options?: GraphQLClientOptions
  ): GraphQLResponse<T> {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };
    const tags = {
      name: request.operationName ?? this.extractOperationName(request.query),
      site: this.siteConfig.id,
      ...mergedOptions.tags,
    };

    let lastError: Error | null = null;
    let lastResponse: RefinedResponse<ResponseType> | null = null;

    // Retry loop
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      if (attempt > 0) {
        graphqlRetries.add(1, tags);
        const delay = this.calculateBackoffDelay(attempt);
        this.logger.warn(`Retry attempt ${attempt}/${this.retryConfig.maxRetries} after ${delay}ms`);
        this.sleep(delay);
      }

      try {
        lastResponse = this.makeRequest(request, tags);

        // Check for HTTP-level success
        if (lastResponse.status >= 200 && lastResponse.status < 300) {
          const result = this.parseResponse<T>(lastResponse, tags, startTime);
          
          // Check for GraphQL-level errors that should not be retried
          if (result.errors && !this.isRetryableGraphQLError(result.errors)) {
            return result;
          }
          
          // If no errors, return success
          if (!result.errors || result.errors.length === 0) {
            return result;
          }
        }

        // Check if status is retryable
        if (!this.retryConfig.retryableStatuses.includes(lastResponse.status)) {
          break;
        }

      } catch (error) {
        lastError = error as Error;
        this.logger.error(`Request failed: ${lastError.message}`);
        
        // Don't retry on non-network errors
        if (!this.isNetworkError(lastError)) {
          break;
        }
      }
    }

    // All retries exhausted or non-retryable error
    // Note: do NOT add metrics here — parseResponse() handles them to avoid double-counting
    if (lastResponse) {
      return this.parseResponse<T>(lastResponse, tags, startTime);
    }

    // Return error response if no response received
    return {
      errors: [{
        message: lastError?.message ?? 'Unknown error occurred',
        extensions: { category: 'network', code: 'REQUEST_FAILED' },
      }],
    };
  }

  /**
   * Make the actual HTTP request
   */
  private makeRequest(
    request: GraphQLRequest,
    tags: Record<string, string>
  ): RefinedResponse<ResponseType> {
    const headers = this.buildHeaders();
    const payload = JSON.stringify(request);

    this.logger.debug(`GraphQL Request: ${tags.name}`, { variables: request.variables });

    const response = http.post(this.endpoint, payload, {
      headers,
      tags,
      timeout: this.timeout,
    });

    this.logger.debug(`GraphQL Response: ${response.status}`, {
      duration: response.timings.duration,
    });

    // Record infrastructure timing metrics for every request
    recordTimingMetrics({
      waiting: response.timings.waiting,
      tls_handshaking: response.timings.tls_handshaking,
      connecting: response.timings.connecting,
    });

    return response;
  }

  /**
   * Build headers for the request
   */
  private buildHeaders(): Record<string, string> {
    const headers = { ...this.defaultHeaders };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Parse the GraphQL response
   */
  private parseResponse<T>(
    response: RefinedResponse<ResponseType>,
    tags: Record<string, string>,
    startTime: number
  ): GraphQLResponse<T> {
    const duration = Date.now() - startTime;
    graphqlDuration.add(duration, tags);
    graphqlRequests.add(1, tags);

    // Handle non-JSON responses
    if (!response.body) {
      graphqlErrors.add(1, tags);
      return {
        errors: [{
          message: 'Empty response body',
          extensions: { category: 'http', code: 'EMPTY_RESPONSE' },
        }],
      };
    }

    try {
      const body = response.json() as GraphQLResponse<T>;

      // Track error rate
      if (body.errors && body.errors.length > 0) {
        graphqlErrors.add(1, tags);
        this.logGraphQLErrors(body.errors, tags.name);
      } else {
        graphqlErrors.add(0, tags);
      }

      return body;
    } catch (parseError) {
      graphqlErrors.add(1, tags);
      this.logger.error(`Failed to parse response: ${(parseError as Error).message}`);
      
      return {
        errors: [{
          message: `Response parse error: ${(parseError as Error).message}`,
          extensions: { 
            category: 'parse', 
            code: 'INVALID_JSON',
            rawBody: String(response.body).substring(0, 200),
          },
        }],
      };
    }
  }

  /**
   * Extract operation name from query string
   */
  private extractOperationName(query: string): string {
    const match = query.match(/(?:query|mutation)\s+(\w+)/);
    return match?.[1] ?? 'UnnamedOperation';
  }

  /**
   * Log GraphQL errors for debugging
   */
  private logGraphQLErrors(errors: GraphQLError[], operationName: string): void {
    for (const error of errors) {
      this.logger.error(`GraphQL Error in ${operationName}: ${error.message}`, {
        path: error.path,
        category: error.extensions?.category,
      });
    }
  }

  /**
   * Check if GraphQL errors are retryable
   */
  private isRetryableGraphQLError(errors: GraphQLError[]): boolean {
    const retryableCategories = ['internal', 'graphql-rate-limited'];
    
    return errors.some(error => {
      const category = error.extensions?.category;
      return category && retryableCategories.includes(category);
    });
  }

  /**
   * Check if error is a network error
   */
  private isNetworkError(error: Error): boolean {
    const networkErrorPatterns = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNRESET',
      'socket hang up',
      'network',
    ];

    return networkErrorPatterns.some(pattern => 
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Calculate backoff delay for retries
   */
  private calculateBackoffDelay(attempt: number): number {
    const delay = this.retryConfig.initialDelay * 
      Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    
    return Math.min(delay + jitter, this.retryConfig.maxDelay);
  }

  /**
   * Sleep for the specified duration
   */
  private sleep(ms: number): void {
    // Convert milliseconds to seconds for k6's sleep function
    const seconds = ms / 1000;
    sleep(seconds);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check GraphQL response for errors and optionally fail the test
 * 
 * @param response - GraphQL response to check
 * @param failOnError - Whether to call fail() on error
 * @returns True if response is successful
 */
export function checkGraphQLResponse<T>(
  response: GraphQLResponse<T>,
  failOnError = false
): boolean {
  const hasErrors = response.errors && response.errors.length > 0;
  const hasData = response.data !== undefined && response.data !== null;

  const success = check(response, {
    'GraphQL response has no errors': () => !hasErrors,
    'GraphQL response has data': () => hasData,
  });

  if (!success && failOnError) {
    const errorMessage = response.errors
      ?.map(e => e.message)
      .join(', ') ?? 'Unknown GraphQL error';
    fail(`GraphQL request failed: ${errorMessage}`);
  }

  return success;
}

/**
 * Extract specific field from GraphQL response with type safety
 * 
 * @param response - GraphQL response
 * @param path - Dot-separated path to the field (e.g., 'products.items')
 * @returns The extracted value or undefined
 */
export function extractFromResponse<T, R>(
  response: GraphQLResponse<T>,
  path: string
): R | undefined {
  if (!response.data) {
    return undefined;
  }

  const parts = path.split('.');
  let current: unknown = response.data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    if (typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current as R;
}

/**
 * Format GraphQL errors for logging
 * 
 * @param errors - Array of GraphQL errors
 * @returns Formatted error string
 */
export function formatGraphQLErrors(errors: GraphQLError[]): string {
  return errors
    .map((error, index) => {
      const location = error.locations
        ?.map(loc => `line ${loc.line}, column ${loc.column}`)
        .join('; ');
      const path = error.path?.join('.');
      
      let message = `[${index + 1}] ${error.message}`;
      if (location) message += ` (at ${location})`;
      if (path) message += ` [path: ${path}]`;
      if (error.extensions?.category) message += ` [category: ${error.extensions.category}]`;
      
      return message;
    })
    .join('\n');
}
