/**
 * Authentication Manager Module
 * 
 * Handles customer authentication, token management, and session handling
 * for the k6 eCommerce load testing framework.
 */

import { Counter, Trend, Rate } from 'k6/metrics';
import { GraphQLClient, checkGraphQLResponse } from './graphql-client';
import { createLogger } from './logger';
import { getSiteConfig } from '../config';
import {
  UserCredentials,
  AuthSession,
  SiteConfig,
} from '../types';

const logger = createLogger('AuthManager');

// ============================================================================
// CUSTOM METRICS
// ============================================================================

const authDuration = new Trend('auth_login_duration', true);
const authSuccess = new Rate('auth_login_success');
const authAttempts = new Counter('auth_login_attempts');

// ============================================================================
// GRAPHQL OPERATIONS
// ============================================================================

/**
 * GraphQL mutation for generating customer token
 */
const GENERATE_CUSTOMER_TOKEN = `
  mutation GenerateCustomerToken($email: String!, $password: String!) {
    generateCustomerToken(email: $email, password: $password) {
      token
    }
  }
`;

/**
 * GraphQL mutation for revoking customer token (logout)
 */
const REVOKE_CUSTOMER_TOKEN = `
  mutation RevokeCustomerToken {
    revokeCustomerToken {
      result
    }
  }
`;

/**
 * GraphQL query to get customer info (validates token)
 */
const GET_CUSTOMER = `
  query GetCustomer {
    customer {
      id
      firstname
      lastname
      email
      is_subscribed
    }
  }
`;

/**
 * GraphQL mutation to create empty cart
 */
const CREATE_EMPTY_CART = `
  mutation CreateEmptyCart {
    createEmptyCart
  }
`;

/**
 * GraphQL mutation to get or create customer cart
 */
const GET_CUSTOMER_CART = `
  query GetCustomerCart {
    customerCart {
      id
      total_quantity
    }
  }
`;

// ============================================================================
// RESPONSE TYPES
// ============================================================================

interface GenerateTokenResponse {
  generateCustomerToken: {
    token: string;
  };
}

interface RevokeTokenResponse {
  revokeCustomerToken: {
    result: boolean;
  };
}

interface CustomerResponse {
  customer: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
    is_subscribed: boolean;
  };
}

interface CreateCartResponse {
  createEmptyCart: string;
}

interface CustomerCartResponse {
  customerCart: {
    id: string;
    total_quantity: number;
  };
}

// ============================================================================
// AUTHENTICATION MANAGER CLASS
// ============================================================================

/**
 * Authentication Manager for handling customer login/logout
 */
export class AuthManager {
  private readonly client: GraphQLClient;
  private readonly siteConfig: SiteConfig;
  private currentSession: AuthSession | null = null;

  constructor(client?: GraphQLClient, siteConfig?: SiteConfig) {
    this.siteConfig = siteConfig ?? getSiteConfig();
    this.client = client ?? new GraphQLClient(this.siteConfig);
  }

  /**
   * Login a customer and establish a session
   * 
   * @param credentials - User email and password
   * @returns AuthSession if successful, null otherwise
   */
  login(credentials: UserCredentials): AuthSession | null {
    const startTime = Date.now();
    authAttempts.add(1, { site: this.siteConfig.id });

    logger.info(`Attempting login for: ${credentials.email}`);

    // Generate customer token
    const response = this.client.mutate<GenerateTokenResponse>(
      GENERATE_CUSTOMER_TOKEN,
      {
        email: credentials.email,
        password: credentials.password,
      },
      { tags: { operation: 'login' } }
    );

    const duration = Date.now() - startTime;
    authDuration.add(duration, { site: this.siteConfig.id });

    // Check for success
    const success = checkGraphQLResponse(response);
    authSuccess.add(success ? 1 : 0, { site: this.siteConfig.id });

    if (!success || !response.data?.generateCustomerToken?.token) {
      const errorMsg = response.errors?.[0]?.message ?? 'Unknown login error';
      logger.error(`Login failed for ${credentials.email}: ${errorMsg}`);
      return null;
    }

    const token = response.data.generateCustomerToken.token;
    
    // Set token on the client for subsequent requests
    this.client.setAuthToken(token);

    // Create session
    const session: AuthSession = {
      credentials,
      token: {
        token,
        tokenType: 'Bearer',
      },
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    // Optionally fetch customer ID
    const customerInfo = this.getCustomerInfo();
    if (customerInfo) {
      session.customerId = String(customerInfo.id);
    }

    this.currentSession = session;
    
    logger.info(`Login successful for: ${credentials.email}`);
    
    return session;
  }

  /**
   * Logout the current customer
   * 
   * @returns True if logout was successful
   */
  logout(): boolean {
    if (!this.currentSession) {
      logger.warn('No active session to logout');
      return false;
    }

    logger.info('Attempting logout');

    const response = this.client.mutate<RevokeTokenResponse>(
      REVOKE_CUSTOMER_TOKEN,
      {},
      { tags: { operation: 'logout' } }
    );

    // Clear token regardless of response
    this.client.clearAuthToken();
    this.currentSession = null;

    const success = checkGraphQLResponse(response);
    
    if (success) {
      logger.info('Logout successful');
    } else {
      logger.warn('Logout response had errors, but token cleared locally');
    }

    return success;
  }

  /**
   * Get current customer information (validates token)
   */
  getCustomerInfo(): CustomerResponse['customer'] | null {
    const response = this.client.query<CustomerResponse>(
      GET_CUSTOMER,
      {},
      { tags: { operation: 'getCustomer' } }
    );

    if (!checkGraphQLResponse(response) || !response.data?.customer) {
      return null;
    }

    return response.data.customer;
  }

  /**
   * Create an empty cart for the customer
   */
  createCart(): string | null {
    const response = this.client.mutate<CreateCartResponse>(
      CREATE_EMPTY_CART,
      {},
      { tags: { operation: 'createCart' } }
    );

    if (!checkGraphQLResponse(response) || !response.data?.createEmptyCart) {
      logger.error('Failed to create empty cart');
      return null;
    }

    const cartId = response.data.createEmptyCart;
    
    if (this.currentSession) {
      this.currentSession.cartId = cartId;
    }

    logger.info(`Cart created: ${cartId}`);
    return cartId;
  }

  /**
   * Get or create customer cart
   */
  getOrCreateCart(): string | null {
    // Try to get existing cart first
    const response = this.client.query<CustomerCartResponse>(
      GET_CUSTOMER_CART,
      {},
      { tags: { operation: 'getCustomerCart' } }
    );

    if (checkGraphQLResponse(response) && response.data?.customerCart?.id) {
      const cartId = response.data.customerCart.id;
      
      if (this.currentSession) {
        this.currentSession.cartId = cartId;
      }
      
      logger.info(`Existing cart found: ${cartId}`);
      return cartId;
    }

    // Create new cart if none exists
    return this.createCart();
  }

  /**
   * Get current session
   */
  getSession(): AuthSession | null {
    return this.currentSession;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentSession !== null && this.client.getAuthToken() !== null;
  }

  /**
   * Get current cart ID
   */
  getCartId(): string | null {
    return this.currentSession?.cartId ?? null;
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(): void {
    if (this.currentSession) {
      this.currentSession.lastActivity = Date.now();
    }
  }

  /**
   * Get the GraphQL client (for use in scenarios)
   */
  getClient(): GraphQLClient {
    return this.client;
  }

  /**
   * Restore session from external token (e.g., from setup phase)
   */
  restoreSession(token: string, credentials?: UserCredentials): void {
    this.client.setAuthToken(token);
    
    this.currentSession = {
      credentials: credentials ?? { email: 'unknown', password: '' },
      token: {
        token,
        tokenType: 'Bearer',
      },
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
  }
}

// ============================================================================
// GUEST CART MANAGER
// ============================================================================

/**
 * Guest Cart Manager for unauthenticated users
 */
export class GuestCartManager {
  private readonly client: GraphQLClient;
  private cartId: string | null = null;

  constructor(client?: GraphQLClient, siteConfig?: SiteConfig) {
    const config = siteConfig ?? getSiteConfig();
    this.client = client ?? new GraphQLClient(config);
  }

  /**
   * Create a guest cart
   */
  createCart(): string | null {
    const response = this.client.mutate<CreateCartResponse>(
      CREATE_EMPTY_CART,
      {},
      { tags: { operation: 'createGuestCart' } }
    );

    if (!checkGraphQLResponse(response) || !response.data?.createEmptyCart) {
      logger.error('Failed to create guest cart');
      return null;
    }

    this.cartId = response.data.createEmptyCart;
    logger.info(`Guest cart created: ${this.cartId}`);
    return this.cartId;
  }

  /**
   * Get or create guest cart
   */
  getOrCreateCart(): string | null {
    if (this.cartId) {
      return this.cartId;
    }
    return this.createCart();
  }

  /**
   * Get current cart ID
   */
  getCartId(): string | null {
    return this.cartId;
  }

  /**
   * Get the GraphQL client
   */
  getClient(): GraphQLClient {
    return this.client;
  }

  /**
   * Set cart ID (e.g., from external source)
   */
  setCartId(cartId: string): void {
    this.cartId = cartId;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a new AuthManager instance
 */
export function createAuthManager(siteConfig?: SiteConfig): AuthManager {
  return new AuthManager(undefined, siteConfig);
}

/**
 * Create a new GuestCartManager instance
 */
export function createGuestCartManager(siteConfig?: SiteConfig): GuestCartManager {
  return new GuestCartManager(undefined, siteConfig);
}

/**
 * Quick login helper function
 */
export function quickLogin(
  email: string,
  password: string,
  siteConfig?: SiteConfig
): { session: AuthSession | null; manager: AuthManager } {
  const manager = createAuthManager(siteConfig);
  const session = manager.login({ email, password });
  return { session, manager };
}
