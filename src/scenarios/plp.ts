/**
 * Product Listing Page (PLP) Scenario
 * 
 * Tests the category/product listing page load by querying category data
 * and product listings via GraphQL. Simulates a user browsing category pages.
 * 
 * Features:
 * - Fetches category info and products by category URL path
 * - Supports pagination (first page load)
 * - Validates product listing response structure
 * - Tracks PLP-specific metrics (query time, products found, etc.)
 * - Each VU views unique categories to avoid cache bias
 */

import { check, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { GraphQLClient, checkGraphQLResponse } from '../lib/graphql-client';
import { createLogger } from '../lib/logger';
import { measureTime } from '../lib/utils';
import { recordScenarioMetrics } from '../lib/metrics';
import { getSiteConfig, isDryRun } from '../config';
import { 
  SiteConfig, 
  ScenarioResult,
  CategoryData 
} from '../types';

const logger = createLogger('PLPScenario');

// ============================================================================
// SCENARIO METRICS
// ============================================================================

const plpCategoryQueryTime = new Trend('plp_category_query_time', true);
const plpProductsQueryTime = new Trend('plp_products_query_time', true);
const plpCategoryFound = new Rate('plp_category_found');
const plpProductsReturned = new Rate('plp_products_returned');
const plpTotalProductCount = new Trend('plp_total_product_count', false);
const plpPageViews = new Counter('plp_page_views');

// ============================================================================
// GRAPHQL QUERIES
// ============================================================================

/**
 * Query to resolve a category URL path to category data
 * Uses the urlResolver / route query pattern used by Magento PWA
 */
const RESOLVE_CATEGORY_URL = `
  query ResolveCategoryUrl($urlPath: String!) {
    categoryList(filters: { url_path: { eq: $urlPath } }) {
      id
      uid
      name
      url_path
      url_key
      description
      meta_title
      meta_description
      product_count
      breadcrumbs {
        category_id
        category_name
        category_url_path
      }
      children {
        id
        name
        url_path
        product_count
      }
    }
  }
`;

/**
 * Query to get products for a category with pagination and sorting
 * Mirrors what a real storefront fetches on PLP load
 */
const GET_CATEGORY_PRODUCTS = `
  query GetCategoryProducts($categoryUid: String!, $pageSize: Int!, $currentPage: Int!, $sort: ProductAttributeSortInput) {
    products(
      filter: { category_uid: { eq: $categoryUid } }
      pageSize: $pageSize
      currentPage: $currentPage
      sort: $sort
    ) {
      total_count
      page_info {
        current_page
        page_size
        total_pages
      }
      aggregations {
        attribute_code
        label
        count
        options {
          label
          value
          count
        }
      }
      items {
        id
        uid
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
            discount {
              amount_off
              percent_off
            }
          }
        }
        small_image {
          url
          label
        }
        ... on ConfigurableProduct {
          configurable_options {
            attribute_code
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
        }
      }
    }
  }
`;

/**
 * Lightweight category products query — no aggregations
 */
const GET_CATEGORY_PRODUCTS_LIGHT = `
  query GetCategoryProductsLight($categoryUid: String!, $pageSize: Int!, $currentPage: Int!) {
    products(
      filter: { category_uid: { eq: $categoryUid } }
      pageSize: $pageSize
      currentPage: $currentPage
    ) {
      total_count
      page_info {
        current_page
        page_size
        total_pages
      }
      items {
        id
        sku
        name
        __typename
        url_key
        stock_status
        price_range {
          minimum_price {
            final_price {
              value
              currency
            }
          }
        }
        small_image {
          url
          label
        }
      }
    }
  }
`;

// ============================================================================
// RESPONSE TYPES
// ============================================================================

interface CategoryListResponse {
  categoryList: CategoryInfo[];
}

interface CategoryInfo {
  id: number;
  uid: string;
  name: string;
  url_path: string;
  url_key: string;
  description?: string;
  meta_title?: string;
  meta_description?: string;
  product_count: number;
  breadcrumbs?: Array<{
    category_id: number;
    category_name: string;
    category_url_path: string;
  }>;
  children?: Array<{
    id: number;
    name: string;
    url_path: string;
    product_count: number;
  }>;
}

interface CategoryProductsResponse {
  products: {
    total_count: number;
    page_info: {
      current_page: number;
      page_size: number;
      total_pages: number;
    };
    aggregations?: Array<{
      attribute_code: string;
      label: string;
      count: number;
      options: Array<{
        label: string;
        value: string;
        count: number;
      }>;
    }>;
    items: PLPProductItem[];
  };
}

interface PLPProductItem {
  id: number;
  uid?: string;
  sku: string;
  name: string;
  __typename: string;
  url_key: string;
  stock_status: string;
  price_range: {
    minimum_price: {
      regular_price?: { value: number; currency: string };
      final_price: { value: number; currency: string };
      discount?: { amount_off: number; percent_off: number };
    };
  };
  small_image?: {
    url: string;
    label: string;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default products per page, matching typical storefront defaults */
const DEFAULT_PAGE_SIZE = 24;

// ============================================================================
// MAIN SCENARIO FUNCTION
// ============================================================================

/**
 * Execute the Product Listing Page scenario
 * 
 * @param categoryData - Category to view (urlPath required)
 * @param client - Optional GraphQL client (uses default if not provided)
 * @param siteConfig - Optional site configuration override
 * @returns Scenario result with category/product data
 */
export function plpScenario(
  categoryData: CategoryData,
  client?: GraphQLClient,
  siteConfig?: SiteConfig
): { result: ScenarioResult; category: CategoryInfo | null; productCount: number } {
  const config = siteConfig ?? getSiteConfig();

  logger.info(`Starting PLP scenario for: ${categoryData.urlPath}`);

  // Dry run mode
  if (isDryRun()) {
    logger.info('DRY RUN: Skipping actual PLP load');
    return {
      result: {
        success: true,
        scenario: 'plp',
        duration: 0,
        data: { dryRun: true },
      },
      category: null,
      productCount: 0,
    };
  }

  const startTime = Date.now();
  const gqlClient = client ?? new GraphQLClient(config);
  let category: CategoryInfo | null = null;
  let productCount = 0;
  let success = false;
  let errorMessage: string | undefined;

  try {
    // ── Step 1: Resolve category URL path ──────────────────────────────
    const resolveResult = group('Resolve Category URL', () => {
      return resolveCategory(gqlClient, categoryData.urlPath);
    });

    category = resolveResult.category;

    if (!resolveResult.success || !category) {
      // Category not found (404 equivalent) — still counts as a "viewed" page
      plpCategoryFound.add(0);
      plpPageViews.add(1);

      const duration = Date.now() - startTime;
      recordScenarioMetrics('plp', duration, false, { site: config.id });

      return {
        result: {
          success: false,
          scenario: 'plp',
          duration,
          error: resolveResult.error ?? `Category not found: ${categoryData.urlPath}`,
          data: {
            urlPath: categoryData.urlPath,
            found: false,
          },
        },
        category: null,
        productCount: 0,
      };
    }

    plpCategoryFound.add(1);

    // ── Step 2: Fetch products for the category ────────────────────────
    const productsResult = group('Load Category Products', () => {
      return loadCategoryProducts(gqlClient, category!.uid, {
        pageSize: categoryData.pageSize ?? DEFAULT_PAGE_SIZE,
        currentPage: categoryData.currentPage ?? 1,
      });
    });

    productCount = productsResult.totalCount;
    success = productsResult.success;
    errorMessage = productsResult.error;
    plpProductsReturned.add(productCount > 0 ? 1 : 0);
    plpTotalProductCount.add(productCount);

    // Think time is applied by the caller (test file) to avoid double-counting

  } catch (error) {
    success = false;
    errorMessage = (error as Error).message;
    logger.error(`PLP scenario failed: ${errorMessage}`);
  }

  const duration = Date.now() - startTime;

  // Record metrics
  recordScenarioMetrics('plp', duration, success, { site: config.id });
  plpPageViews.add(1);

  const result: ScenarioResult = {
    success,
    scenario: 'plp',
    duration,
    error: errorMessage,
    data: {
      urlPath: categoryData.urlPath,
      categoryName: category?.name,
      categoryId: category?.id,
      productCount,
      found: category !== null,
    },
  };

  logger.info(`PLP scenario completed: ${success ? 'SUCCESS' : 'FAILED'}`, {
    duration,
    urlPath: categoryData.urlPath,
    productCount,
  });

  return { result, category, productCount };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Resolve a category URL path to category info
 */
function resolveCategory(
  client: GraphQLClient,
  urlPath: string
): { success: boolean; category: CategoryInfo | null; error?: string } {
  const { result: response, duration } = measureTime(() => {
    return client.query<CategoryListResponse>(
      RESOLVE_CATEGORY_URL,
      { urlPath },
      { tags: { operation: 'resolveCategoryUrl' } }
    );
  });

  plpCategoryQueryTime.add(duration);

  if (!checkGraphQLResponse(response)) {
    return {
      success: false,
      category: null,
      error: response.errors?.[0]?.message ?? 'Category query failed',
    };
  }

  const categories = response.data?.categoryList ?? [];

  if (categories.length === 0) {
    return {
      success: false,
      category: null,
      error: `Category not found for path: ${urlPath}`,
    };
  }

  const category = categories[0];

  const valid = check(category, {
    'Category has ID': (c) => !!c.id,
    'Category has UID': (c) => !!c.uid,
    'Category has name': (c) => !!c.name,
  });

  return {
    success: valid,
    category,
    error: valid ? undefined : 'Category data validation failed',
  };
}

/**
 * Load products for a category with pagination
 */
function loadCategoryProducts(
  client: GraphQLClient,
  categoryUid: string,
  pagination: { pageSize: number; currentPage: number }
): { success: boolean; totalCount: number; items: PLPProductItem[]; error?: string } {
  const { result: response, duration } = measureTime(() => {
    return client.query<CategoryProductsResponse>(
      GET_CATEGORY_PRODUCTS,
      {
        categoryUid,
        pageSize: pagination.pageSize,
        currentPage: pagination.currentPage,
        sort: { position: 'ASC' },
      },
      { tags: { operation: 'getCategoryProducts' } }
    );
  });

  plpProductsQueryTime.add(duration);

  if (!checkGraphQLResponse(response)) {
    return {
      success: false,
      totalCount: 0,
      items: [],
      error: response.errors?.[0]?.message ?? 'Products query failed',
    };
  }

  const products = response.data?.products;
  const items = products?.items ?? [];
  const totalCount = products?.total_count ?? 0;

  const valid = check(products, {
    'Products response has items array': (p) => Array.isArray(p?.items),
    'Products response has total_count': (p) => typeof p?.total_count === 'number',
    'Products response has page_info': (p) => !!p?.page_info,
  });

  if (valid && items.length > 0) {
    // Validate first product item
    check(items[0], {
      'Product item has SKU': (p) => !!p.sku,
      'Product item has name': (p) => !!p.name,
      'Product item has price': (p) => !!p.price_range?.minimum_price?.final_price?.value,
    });
  }

  return {
    success: valid,
    totalCount,
    items,
    error: valid ? undefined : 'Product listing validation failed',
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default plpScenario;

/**
 * Quick PLP load — returns product count for the category
 */
export function quickPlpScenario(
  urlPath: string,
  client?: GraphQLClient,
  siteConfig?: SiteConfig
): number {
  const { productCount } = plpScenario({ urlPath }, client, siteConfig);
  return productCount;
}

/**
 * Light PLP query — no aggregations, minimal data
 */
export function lightPlpQuery(
  categoryUid: string,
  client: GraphQLClient,
  pageSize = DEFAULT_PAGE_SIZE
): PLPProductItem[] {
  const response = client.query<CategoryProductsResponse>(
    GET_CATEGORY_PRODUCTS_LIGHT,
    { categoryUid, pageSize, currentPage: 1 },
    { tags: { operation: 'getCategoryProductsLight' } }
  );

  if (!checkGraphQLResponse(response)) {
    return [];
  }

  return response.data?.products?.items ?? [];
}
