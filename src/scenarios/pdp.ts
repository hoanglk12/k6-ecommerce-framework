/**
 * Product Detail Page (PDP) Scenario
 * 
 * Tests the product detail page load by querying product data via GraphQL.
 * Supports both simple and configurable products.
 */

import { check, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { GraphQLClient, checkGraphQLResponse } from '../lib/graphql-client';
import { createLogger } from '../lib/logger';
import { measureTime } from '../lib/utils';
import { recordScenarioMetrics } from '../lib/metrics';
import { getSiteConfig, isDryRun } from '../config';
import { 
  ProductData, 
  Product, 
  SiteConfig, 
  ScenarioResult
} from '../types';

const logger = createLogger('PDPScenario');

// ============================================================================
// SCENARIO METRICS
// ============================================================================

const pdpQueryTime = new Trend('pdp_product_query_time', true);
const pdpProductFound = new Rate('pdp_product_found');
const pdpInStock = new Rate('pdp_product_in_stock');

// ============================================================================
// GRAPHQL QUERIES
// ============================================================================

/**
 * Query to get product by SKU
 */
const GET_PRODUCT_BY_SKU = `
  query GetProductBySku($sku: String!) {
    products(filter: { sku: { eq: $sku } }) {
      items {
        id
        sku
        name
        __typename
        url_key
        stock_status
        meta_title
        meta_description
        description {
          html
        }
        short_description {
          html
        }
        price_range {
          minimum_price {
            regular_price {
              value
              currency
            }
            final_price {
              value
              currency
            }
            discount {
              amount_off
              percent_off
            }
          }
          maximum_price {
            regular_price {
              value
              currency
            }
            final_price {
              value
              currency
            }
          }
        }
        media_gallery {
          url
          label
          position
        }
        categories {
          id
          name
          url_path
        }
        ... on ConfigurableProduct {
          configurable_options {
            attribute_code
            attribute_id
            label
            values {
              value_index
              label
              swatch_data {
                ... on TextSwatchData {
                  value
                }
                ... on ColorSwatchData {
                  value
                }
              }
            }
          }
          variants {
            product {
              id
              sku
              stock_status
              price_range {
                minimum_price {
                  final_price {
                    value
                    currency
                  }
                }
              }
            }
            attributes {
              code
              value_index
            }
          }
        }
      }
      total_count
    }
  }
`;

/**
 * Query to get product by URL key
 */
const GET_PRODUCT_BY_URL_KEY = `
  query GetProductByUrlKey($urlKey: String!) {
    products(filter: { url_key: { eq: $urlKey } }) {
      items {
        id
        sku
        name
        __typename
        url_key
        stock_status
        price_range {
          minimum_price {
            regular_price {
              value
              currency
            }
            final_price {
              value
              currency
            }
          }
        }
        ... on ConfigurableProduct {
          configurable_options {
            attribute_code
            label
            values {
              value_index
              label
            }
          }
        }
      }
      total_count
    }
  }
`;

/**
 * Lightweight query for basic product info
 */
const GET_PRODUCT_BASIC = `
  query GetProductBasic($sku: String!) {
    products(filter: { sku: { eq: $sku } }) {
      items {
        id
        sku
        name
        stock_status
        __typename
        price_range {
          minimum_price {
            final_price {
              value
              currency
            }
          }
        }
      }
      total_count
    }
  }
`;

// ============================================================================
// RESPONSE TYPES
// ============================================================================

interface ProductsResponse {
  products: {
    items: Product[];
    total_count: number;
  };
}

// ============================================================================
// MAIN SCENARIO FUNCTION
// ============================================================================

/**
 * Execute the Product Detail Page scenario
 * 
 * @param productData - Product to view (SKU or URL key required)
 * @param client - Optional GraphQL client (uses default if not provided)
 * @param siteConfig - Optional site configuration override
 * @returns Scenario result with product data
 */
export function pdpScenario(
  productData: ProductData,
  client?: GraphQLClient,
  siteConfig?: SiteConfig
): { result: ScenarioResult; product: Product | null } {
  const config = siteConfig ?? getSiteConfig();
  
  logger.info(`Starting PDP scenario for: ${productData.sku || productData.urlKey}`);

  // Check for dry run mode
  if (isDryRun()) {
    logger.info('DRY RUN: Skipping actual PDP load');
    return {
      result: {
        success: true,
        scenario: 'pdp',
        duration: 0,
        data: { dryRun: true },
      },
      product: null,
    };
  }

  const startTime = Date.now();
  const gqlClient = client ?? new GraphQLClient(config);
  let product: Product | null = null;
  let success = false;
  let errorMessage: string | undefined;

  try {
    // Group: Load Product Data
    const loadResult = group('Load Product Detail Page', () => {
      return loadProductData(gqlClient, productData);
    });

    product = loadResult.product;
    success = loadResult.success;
    errorMessage = loadResult.error;

    // If product is configurable, load variant details
    if (success && product && product.__typename === 'ConfigurableProduct') {
      group('Load Configurable Options', () => {
        validateConfigurableOptions(product!);
      });
    }

    // Think time is applied by the caller (test file) to avoid double-counting

  } catch (error) {
    success = false;
    errorMessage = (error as Error).message;
    logger.error(`PDP scenario failed: ${errorMessage}`);
  }

  const duration = Date.now() - startTime;

  // Record metrics
  recordScenarioMetrics('pdp', duration, success, { site: config.id });
  pdpProductFound.add(product !== null ? 1 : 0);
  
  if (product) {
    pdpInStock.add(product.stock_status === 'IN_STOCK' ? 1 : 0);
  }

  const result: ScenarioResult = {
    success,
    scenario: 'pdp',
    duration,
    error: errorMessage,
    data: {
      sku: product?.sku,
      name: product?.name,
      type: product?.__typename,
      inStock: product?.stock_status === 'IN_STOCK',
      price: product?.price_range?.minimum_price?.final_price?.value,
    },
  };

  logger.info(`PDP scenario completed: ${success ? 'SUCCESS' : 'FAILED'}`, {
    duration,
    sku: product?.sku,
  });

  return { result, product };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Load product data from GraphQL
 */
function loadProductData(
  client: GraphQLClient,
  productData: ProductData
): { success: boolean; product: Product | null; error?: string } {
  const { result, duration } = measureTime(() => {
    if (productData.sku) {
      return client.query<ProductsResponse>(
        GET_PRODUCT_BY_SKU,
        { sku: productData.sku },
        { tags: { operation: 'getProductBySku' } }
      );
    } else if (productData.urlKey) {
      return client.query<ProductsResponse>(
        GET_PRODUCT_BY_URL_KEY,
        { urlKey: productData.urlKey },
        { tags: { operation: 'getProductByUrlKey' } }
      );
    } else {
      throw new Error('Product SKU or URL key is required');
    }
  });

  const response = result;
  pdpQueryTime.add(duration);

  // Check response validity
  if (!checkGraphQLResponse(response)) {
    return {
      success: false,
      product: null,
      error: response.errors?.[0]?.message ?? 'GraphQL query failed',
    };
  }

  const items = response.data?.products?.items ?? [];
  
  if (items.length === 0) {
    return {
      success: false,
      product: null,
      error: `Product not found: ${productData.sku || productData.urlKey}`,
    };
  }

  const product = items[0];

  // Validate product data
  const valid = check(product, {
    'Product has SKU': (p) => !!p.sku,
    'Product has name': (p) => !!p.name,
    'Product has stock status': (p) => !!p.stock_status,
    'Product has price': (p) => !!p.price_range?.minimum_price?.final_price?.value,
  });

  return {
    success: valid,
    product,
    error: valid ? undefined : 'Product data validation failed',
  };
}

/**
 * Validate configurable product options
 */
function validateConfigurableOptions(product: Product): boolean {
  if (!product.configurable_options) {
    logger.warn('Configurable product has no options');
    return false;
  }

  const valid = check(product, {
    'Has configurable options': (p) => (p.configurable_options?.length ?? 0) > 0,
    'Has variants': (p) => (p.variants?.length ?? 0) > 0,
    'Options have values': (p) => 
      p.configurable_options?.every(opt => opt.values.length > 0) ?? false,
  });

  if (valid) {
    logger.debug('Configurable options validated', {
      optionCount: product.configurable_options.length,
      variantCount: product.variants?.length ?? 0,
    });
  }

  return valid;
}

// ============================================================================
// VARIANT HELPER FUNCTIONS
// ============================================================================

/**
 * Find an in-stock variant for a configurable product
 * 
 * @param product - Configurable product
 * @returns First in-stock variant SKU, or null if none available
 */
export function findInStockVariant(product: Product): string | null {
  if (product.__typename !== 'ConfigurableProduct' || !product.variants) {
    return product.stock_status === 'IN_STOCK' ? product.sku : null;
  }

  const inStockVariant = product.variants.find(
    variant => variant.product.stock_status === 'IN_STOCK'
  );

  return inStockVariant?.product.sku ?? null;
}

/**
 * Get selected options for adding a configurable product to cart
 * 
 * @param product - Configurable product
 * @param variantSku - SKU of the variant to select
 * @returns Array of selected option IDs
 */
export function getSelectedOptions(
  product: Product,
  variantSku?: string
): string[] {
  if (product.__typename !== 'ConfigurableProduct' || !product.variants) {
    return [];
  }

  // Find the variant
  const variant = variantSku
    ? product.variants.find(v => v.product.sku === variantSku)
    : product.variants.find(v => v.product.stock_status === 'IN_STOCK');

  if (!variant) {
    return [];
  }

  // Build selected options
  const selectedOptions: string[] = [];
  
  for (const attr of variant.attributes) {
    const option = product.configurable_options?.find(
      opt => opt.attribute_code === attr.code
    );
    
    if (option) {
      // Format: attributeId/valueIndex (base64 encoded in Magento 2.4+)
      const optionUid = `${option.attribute_id}/${attr.value_index}`;
      selectedOptions.push(btoa(optionUid));
    }
  }

  return selectedOptions;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default pdpScenario;

/**
 * Quick PDP load function that returns just the product
 */
export function quickPdpScenario(
  sku: string,
  client?: GraphQLClient,
  siteConfig?: SiteConfig
): Product | null {
  const { product } = pdpScenario({ sku }, client, siteConfig);
  return product;
}

/**
 * Light PDP query - faster, less data
 */
export function lightPdpQuery(
  sku: string,
  client: GraphQLClient
): Product | null {
  const response = client.query<ProductsResponse>(
    GET_PRODUCT_BASIC,
    { sku },
    { tags: { operation: 'getProductBasic' } }
  );

  if (!checkGraphQLResponse(response)) {
    return null;
  }

  return response.data?.products?.items?.[0] ?? null;
}
