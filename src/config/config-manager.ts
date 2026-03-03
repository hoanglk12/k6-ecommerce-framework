/**
 * Configuration Manager Module
 * 
 * Centralized configuration management for the k6 eCommerce framework.
 * Handles environment detection, site configuration, and runtime settings.
 */

import { 
  SiteConfig, 
  SiteIdentifier, 
  EnvironmentConfig, 
  EnvironmentType,
  ThresholdConfig 
} from '../types';
import { getEnvVar, getEnvBool, getEnvNumber } from '../lib/utils';

// ============================================================================
// SITE CONFIGURATIONS
// ============================================================================

// Helper to get environment-specific URL
function getBaseUrl(stagingUrl: string, productionUrl: string, env: string): string {
  return env === 'production' ? productionUrl : stagingUrl;
}

/**
 * Create site configuration with environment-aware URLs
 */
function createSiteConfig(
  id: SiteIdentifier,
  name: string,
  stagingUrl: string,
  productionUrl: string,
  currency: string,
  locale: string,
  env: string = 'staging'
): SiteConfig {
  const baseUrl = getBaseUrl(stagingUrl, productionUrl, env);
  // Derive store code from locale suffix: 'en_AU' → 'au', 'en_NZ' → 'nz'
  const storeCode = locale.split('_')[1]?.toLowerCase() ?? 'default';
  return {
    id,
    name,
    baseUrl,
    graphqlEndpoint: `${baseUrl}/graphql`,
    storeCode,
    currency,
    locale,
    rateLimit: 50,
    headers: {
      'Origin': baseUrl,
      'User-Agent': 'k6-load-test/1.0',
    },
  };
}

/**
 * Get all site configurations for the current environment
 */
function getSiteConfigs(env: string = 'staging'): Record<SiteIdentifier, SiteConfig> {
  return {
    'platypus-au': createSiteConfig(
      'platypus-au',
      'Platypus Shoes Australia',
      'https://stag-platypus-au.accentgra.com',
      'https://www.platypusshoes.com.au',
      'AUD',
      'en_AU',
      env
    ),
    'platypus-nz': createSiteConfig(
      'platypus-nz',
      'Platypus Shoes New Zealand',
      'https://stag-platypus-nz.accentgra.com',
      'https://www.platypusshoes.co.nz',
      'NZD',
      'en_NZ',
      env
    ),
    'skechers-au': createSiteConfig(
      'skechers-au',
      'Skechers Australia',
      'https://stag-skechers-au.accentgra.com',
      'https://www.skechers.com.au',
      'AUD',
      'en_AU',
      env
    ),
    'skechers-nz': createSiteConfig(
      'skechers-nz',
      'Skechers New Zealand',
      'https://stag-skechers-nz.accentgra.com',
      'https://www.skechers.co.nz',
      'NZD',
      'en_NZ',
      env
    ),
    'drmartens-au': createSiteConfig(
      'drmartens-au',
      'Dr Martens Australia',
      'https://stag-drmartens-au.accentgra.com',
      'https://www.drmartens.com.au',
      'AUD',
      'en_AU',
      env
    ),
    'drmartens-nz': createSiteConfig(
      'drmartens-nz',
      'Dr Martens New Zealand',
      'https://stag-drmartens-nz.accentgra.com',
      'https://www.drmartens.co.nz',
      'NZD',
      'en_NZ',
      env
    ),
    'vans-au': createSiteConfig(
      'vans-au',
      'Vans Australia',
      'https://stag-vans-au.accentgra.com',
      'https://www.vans.com.au',
      'AUD',
      'en_AU',
      env
    ),
    'vans-nz': createSiteConfig(
      'vans-nz',
      'Vans New Zealand',
      'https://stag-vans-nz.accentgra.com',
      'https://www.vans.co.nz',
      'NZD',
      'en_NZ',
      env
    ),
  };
}

/**
 * Site configurations - initialized during ConfigManager construction
 */
let SITE_CONFIGS: Record<SiteIdentifier, SiteConfig>;

// ============================================================================
// ENVIRONMENT CONFIGURATIONS
// ============================================================================

/**
 * Development environment settings
 */
const DEVELOPMENT_ENV: EnvironmentConfig = {
  environment: 'development',
  isProduction: false,
  dryRun: false,
  debug: true,
  timeout: 60000,
  maxRetries: 3,
  thinkTime: [1, 3],
};

/**
 * Staging environment settings
 */
const STAGING_ENV: EnvironmentConfig = {
  environment: 'staging',
  isProduction: false,
  dryRun: false,
  debug: false,
  timeout: 30000,
  maxRetries: 2,
  thinkTime: [2, 5],
};

/**
 * Production environment settings
 */
const PRODUCTION_ENV: EnvironmentConfig = {
  environment: 'production',
  isProduction: true,
  dryRun: false,
  debug: false,
  timeout: 30000,
  maxRetries: 1,
  thinkTime: [3, 8],
};

/**
 * Map of all environment configurations
 */
const ENVIRONMENT_CONFIGS: Record<EnvironmentType, EnvironmentConfig> = {
  development: DEVELOPMENT_ENV,
  staging: STAGING_ENV,
  production: PRODUCTION_ENV,
};

// ============================================================================
// THRESHOLD CONFIGURATIONS
// ============================================================================

/**
 * Default performance thresholds
 */
export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  http_req_duration_p95: 800,
  http_req_duration_p99: 2000,
  http_req_failed_rate: 0.01,
  http_req_waiting_p95: 600,
  scenarios: {
    login: {
      duration_p95: 3000,
      success_rate: 0.95,
    },
    pdp: {
      duration_p95: 800,
      success_rate: 0.99,
    },
    plp: {
      duration_p95: 3000,
      success_rate: 0.95,
    },
    addToCart: {
      duration_p95: 2500,
      success_rate: 0.95,
    },
    placeOrder: {
      duration_p95: 6000,
      success_rate: 0.90,
    },
  },
};

// ============================================================================
// CONFIGURATION MANAGER
// ============================================================================

/**
 * Configuration Manager class
 * Provides centralized access to all configuration settings
 */
export class ConfigManager {
  private static instance: ConfigManager | null = null;
  
  private readonly site: SiteConfig;
  private readonly environment: EnvironmentConfig;
  private readonly thresholds: ThresholdConfig;

  private constructor() {
    this.site = this.loadSiteConfig();
    this.environment = this.loadEnvironmentConfig();
    this.thresholds = this.loadThresholdConfig();
    
    // Apply environment variable overrides
    this.applyOverrides();
    
    // Validate production safety
    this.validateProductionSafety();
  }

  /**
   * Get singleton instance of ConfigManager
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Reset the singleton (useful for testing)
   */
  static reset(): void {
    ConfigManager.instance = null;
  }

  /**
   * Get the current site configuration
   */
  getSiteConfig(): SiteConfig {
    return { ...this.site };
  }

  /**
   * Get the current environment configuration
   */
  getEnvironmentConfig(): EnvironmentConfig {
    return { ...this.environment };
  }

  /**
   * Get threshold configuration
   */
  getThresholdConfig(): ThresholdConfig {
    return { ...this.thresholds };
  }

  /**
   * Check if running in dry run mode
   */
  isDryRun(): boolean {
    return this.environment.dryRun || getEnvBool('DRY_RUN', false);
  }

  /**
   * Check if running against production
   */
  isProduction(): boolean {
    return this.environment.isProduction;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebug(): boolean {
    return this.environment.debug || getEnvBool('DEBUG', false);
  }

  /**
   * Get k6 options object with thresholds
   */
  getK6Options(): Record<string, unknown> {
    return {
      thresholds: {
        'http_req_duration': [
          `p(95)<${this.thresholds.http_req_duration_p95}`,
          `p(99)<${this.thresholds.http_req_duration_p99}`,
        ],
        'http_req_failed': [`rate<${this.thresholds.http_req_failed_rate}`],
        'http_req_waiting': [`p(95)<${this.thresholds.http_req_waiting_p95}`],
      },
      tags: {
        site: this.site.id,
        environment: this.environment.environment,
      },
      // Recommended k6 settings
      noConnectionReuse: false,
      userAgent: this.site.headers?.['User-Agent'] ?? 'k6-load-test/1.0',
      insecureSkipTLSVerify: false,
    };
  }

  /**
   * Load site configuration from environment
   */
  private loadSiteConfig(): SiteConfig {
    // Initialize SITE_CONFIGS based on environment
    const envName = getEnvVar('ENVIRONMENT', 'staging').toLowerCase();
    SITE_CONFIGS = getSiteConfigs(envName);
    
    const siteId = getEnvVar('SITE', 'platypus-au').toLowerCase() as SiteIdentifier;
    
    if (!(siteId in SITE_CONFIGS)) {
      console.warn(`Unknown site: ${siteId}, defaulting to 'platypus-au'`);
      return SITE_CONFIGS['platypus-au'];
    }
    
    return { ...SITE_CONFIGS[siteId] };
  }

  /**
   * Load environment configuration
   */
  private loadEnvironmentConfig(): EnvironmentConfig {
    const envName = getEnvVar('ENVIRONMENT', 'staging').toLowerCase() as EnvironmentType;
    
    if (!(envName in ENVIRONMENT_CONFIGS)) {
      console.warn(`Unknown environment: ${envName}, defaulting to 'staging'`);
      return { ...STAGING_ENV };
    }
    
    return { ...ENVIRONMENT_CONFIGS[envName] };
  }

  /**
   * Load threshold configuration
   */
  private loadThresholdConfig(): ThresholdConfig {
    return { ...DEFAULT_THRESHOLDS };
  }

  /**
   * Apply environment variable overrides
   */
  private applyOverrides(): void {
    // Override site base URL if provided
    const baseUrlOverride = getEnvVar('BASE_URL');
    if (baseUrlOverride) {
      this.site.baseUrl = baseUrlOverride;
      this.site.graphqlEndpoint = `${baseUrlOverride}/graphql`;
    }

    // Override GraphQL endpoint if provided
    const graphqlOverride = getEnvVar('GRAPHQL_ENDPOINT');
    if (graphqlOverride) {
      this.site.graphqlEndpoint = graphqlOverride;
    }

    // Override timeout
    const timeoutOverride = getEnvNumber('TIMEOUT');
    if (timeoutOverride > 0) {
      this.environment.timeout = timeoutOverride;
    }

    // Override think time
    const thinkTimeMin = getEnvNumber('THINK_TIME_MIN');
    const thinkTimeMax = getEnvNumber('THINK_TIME_MAX');
    if (thinkTimeMin > 0 && thinkTimeMax > 0) {
      this.environment.thinkTime = [thinkTimeMin, thinkTimeMax];
    }

    // Override debug mode
    if (getEnvBool('DEBUG', false)) {
      this.environment.debug = true;
    }

    // Override dry run mode
    if (getEnvBool('DRY_RUN', false)) {
      this.environment.dryRun = true;
    }
  }

  /**
   * Validate production safety settings
   */
  private validateProductionSafety(): void {
    if (this.environment.isProduction) {
      const placeOrderEnabled = getEnvBool('ENABLE_PLACE_ORDER', false);
      const safetyConfirmed = getEnvBool('PRODUCTION_CONFIRMED', false);

      if (placeOrderEnabled && !safetyConfirmed) {
        console.error('⚠️  SAFETY WARNING: Place order is enabled for production!');
        console.error('⚠️  Set PRODUCTION_CONFIRMED=true to proceed.');
        throw new Error('Production safety check failed');
      }

      if (this.environment.isProduction) {
        console.warn('⚠️  Running against PRODUCTION environment');
        console.warn('⚠️  Ensure you have proper authorization');
      }
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Get current site configuration
 */
export function getSiteConfig(): SiteConfig {
  return ConfigManager.getInstance().getSiteConfig();
}

/**
 * Get current environment configuration
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  return ConfigManager.getInstance().getEnvironmentConfig();
}

/**
 * Check if dry run mode is enabled
 */
export function isDryRun(): boolean {
  return ConfigManager.getInstance().isDryRun();
}

/**
 * Check if running against production
 */
export function isProduction(): boolean {
  return ConfigManager.getInstance().isProduction();
}

/**
 * Check if debug mode is enabled
 */
export function isDebug(): boolean {
  return ConfigManager.getInstance().isDebug();
}

/**
 * Get k6 options with proper thresholds
 */
export function getK6Options(): Record<string, unknown> {
  return ConfigManager.getInstance().getK6Options();
}
