/**
 * Product Discovery Script
 * 
 * Discovers real products from eCommerce staging sites using GraphQL.
 * 
 * Classification is done via GraphQL `route` query which resolves a URL key
 * to a product and returns its real stock_status. This is necessary because
 * the PWA frontend returns HTTP 200 for ALL URLs (even non-existent ones),
 * so HTTP-based verification doesn't work.
 *
 * Verification via GraphQL route query:
 *   - route returns data with stock_status=IN_STOCK → product is viewable,
 *     some or all sizes available to add to cart
 *   - route returns data with stock_status=OUT_OF_STOCK → product is viewable,
 *     no sizes available, shows "This Product is currently out of stock" message
 *   - route returns null → product is disabled/not visible → EXCLUDED
 */

import http from 'k6/http';
import { sleep } from 'k6';

const sites = {
  'platypus-au': {
    graphql: 'https://stag-platypus-au.accentgra.com/graphql',
    baseUrl: 'https://stag-platypus-au.accentgra.com'
  },
  'skechers-au': {
    graphql: 'https://stag-skechers-au.accentgra.com/graphql',
    baseUrl: 'https://stag-skechers-au.accentgra.com'
  },
  'drmartens-au': {
    graphql: 'https://stag-drmartens-au.accentgra.com/graphql',
    baseUrl: 'https://stag-drmartens-au.accentgra.com'
  },
  'vans-au': {
    graphql: 'https://stag-vans-au.accentgra.com/graphql',
    baseUrl: 'https://stag-vans-au.accentgra.com'
  }
};

// Broad search terms to discover diverse products
const SEARCH_TERMS = ['shoe', 'boot', 'sneaker', 'sandal', 'clog', 'slip', 'classic', 'old skool', 'run'];

// Query to discover products using search
const DISCOVER_PRODUCTS = `
  query DiscoverProducts($search: String, $pageSize: Int, $currentPage: Int) {
    products(
      search: $search
      pageSize: $pageSize
      currentPage: $currentPage
    ) {
      items {
        sku
        name
        __typename
        stock_status
        url_key
        price_range {
          minimum_price {
            regular_price {
              value
              currency
            }
          }
        }
      }
      total_count
      page_info {
        current_page
        page_size
        total_pages
      }
    }
  }
`;

// Route query to verify a URL resolves to a real, visible product
// Returns product data if valid, null if disabled/non-existent
const ROUTE_QUERY = `
  query VerifyRoute($url: String!) {
    route(url: $url) {
      ... on ConfigurableProduct {
        sku
        name
        stock_status
        price_range {
          minimum_price {
            regular_price {
              value
              currency
            }
          }
        }
      }
      ... on SimpleProduct {
        sku
        name
        stock_status
        price_range {
          minimum_price {
            regular_price {
              value
              currency
            }
          }
        }
      }
      ... on BundleProduct {
        sku
        name
        stock_status
        price_range {
          minimum_price {
            regular_price {
              value
              currency
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetch products via search query
 */
function fetchProducts(endpoint, searchTerm, pageSize, currentPage, siteName) {
  const payload = JSON.stringify({
    query: DISCOVER_PRODUCTS,
    variables: { search: searchTerm, pageSize, currentPage }
  });

  const response = http.post(endpoint, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { site: siteName },
  });

  if (response.status === 200) {
    const data = JSON.parse(response.body);
    if (data.errors) {
      console.error(`GraphQL Errors (${siteName}): ${JSON.stringify(data.errors)}`);
      return { items: [], totalCount: 0 };
    }
    if (data.data && data.data.products) {
      return {
        items: data.data.products.items,
        totalCount: data.data.products.total_count
      };
    }
  }
  console.error(`HTTP Error (${siteName}): ${response.status}`);
  return { items: [], totalCount: 0 };
}

/**
 * Verify a product's URL key via GraphQL route query.
 * Returns product data with verified stock_status if valid, or null if disabled.
 */
function verifyProductRoute(endpoint, urlKey, siteName) {
  const payload = JSON.stringify({
    query: ROUTE_QUERY,
    variables: { url: `${urlKey}.html` }
  });

  const response = http.post(endpoint, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { site: siteName, type: 'route-verify' },
  });

  if (response.status === 200) {
    const data = JSON.parse(response.body);
    if (data.data && data.data.route) {
      return data.data.route; // { sku, name, stock_status, price_range }
    }
  }
  return null; // Disabled or non-existent
}

export default function() {
  console.log('=== Product Discovery with GraphQL Route Verification ===\n');
  console.log('Verification method: GraphQL route query (resolves URL to product)');
  console.log('  route returns product data → product is visible on PDP');
  console.log('  route returns null         → product is disabled/not visible → EXCLUDED');
  console.log('Classification:');
  console.log('  IN_STOCK     = PDP viewable, sizes available to add to cart');
  console.log('  OUT_OF_STOCK = PDP viewable, no sizes available, shows OOS message\n');

  Object.entries(sites).forEach(([siteName, siteConfig]) => {
    console.log(`\n========== ${siteName.toUpperCase()} ==========`);

    // Phase 1: Fetch products via search across multiple terms
    const allProducts = [];
    const seenSkus = {};

    for (const term of SEARCH_TERMS) {
      for (let page = 1; page <= 2; page++) {
        const result = fetchProducts(siteConfig.graphql, term, 20, page, siteName);
        if (result.items.length === 0) break;
        for (const item of result.items) {
          if (!seenSkus[item.sku] && item.url_key) {
            seenSkus[item.sku] = true;
            allProducts.push(item);
          }
        }
      }
      sleep(0.1);
    }

    console.log(`[${siteName}] Found ${allProducts.length} unique products from GraphQL search`);

    // Phase 2: Verify each product via route query and classify
    const verifiedInStock = [];
    const verifiedOOS = [];
    const TARGET_COUNT = 5;

    console.log(`[${siteName}] Verifying products via GraphQL route query...`);

    for (const p of allProducts) {
      // Stop when we have enough of both types
      if (verifiedInStock.length >= TARGET_COUNT && verifiedOOS.length >= TARGET_COUNT) break;

      const routeData = verifyProductRoute(siteConfig.graphql, p.url_key, siteName);

      if (!routeData) {
        // Product not resolvable via route — disabled/not visible, skip
        continue;
      }

      // Use route-verified stock_status (source of truth)
      const routePrice = routeData.price_range
        ? routeData.price_range.minimum_price.regular_price.value
        : 0;
      const routeCurrency = routeData.price_range
        ? routeData.price_range.minimum_price.regular_price.currency
        : 'AUD';

      if (routeData.stock_status === 'IN_STOCK' && verifiedInStock.length < TARGET_COUNT) {
        verifiedInStock.push({
          ...p,
          verifiedStatus: 'IN_STOCK',
          routePrice: routePrice,
          routeCurrency: routeCurrency
        });
        console.log(`  + IN_STOCK     : ${p.sku} | ${routeData.name} | ${routePrice} ${routeCurrency} | ${p.url_key}`);
      } else if (routeData.stock_status === 'OUT_OF_STOCK' && verifiedOOS.length < TARGET_COUNT) {
        verifiedOOS.push({
          ...p,
          verifiedStatus: 'OUT_OF_STOCK',
          routePrice: routePrice,
          routeCurrency: routeCurrency
        });
        console.log(`  + OUT_OF_STOCK : ${p.sku} | ${routeData.name} | ${routePrice} ${routeCurrency} | ${p.url_key}`);
      }

      sleep(0.1);
    }

    // Combine: IN_STOCK first, then OUT_OF_STOCK
    const verifiedProducts = [...verifiedInStock, ...verifiedOOS];
    const brandName = siteName.split('-')[0];

    console.log(`\n[${siteName}] FINAL: ${verifiedInStock.length} IN_STOCK + ${verifiedOOS.length} OUT_OF_STOCK = ${verifiedProducts.length} total (route-verified)`);

    // Generate JSON output
    const jsonData = {
      description: `Products for ${brandName} load testing (route-verified from staging)`,
      site: siteName,
      note: `Products discovered on ${new Date().toISOString().split('T')[0]}. Each product verified via GraphQL route query.`,
      data: verifiedProducts.map((p, idx) => ({
        id: `prod-${String(idx + 1).padStart(3, '0')}`,
        sku: p.sku,
        urlKey: p.url_key,
        name: p.name,
        productType: p.__typename.toLowerCase().replace('product', ''),
        categoryPath: `shoes/${brandName}`,
        quantity: 1,
        stockStatus: p.verifiedStatus,
        price: p.routePrice,
        currency: p.routeCurrency
      }))
    };

    // Generate CSV output
    const csvHeader = 'id,sku,urlKey,name,productType,categoryPath,quantity,stockStatus,price,currency';
    const csvRows = jsonData.data.map(p =>
      `${p.id},${p.sku},${p.urlKey},"${p.name.replace(/"/g, '""')}",${p.productType},${p.categoryPath},${p.quantity},${p.stockStatus},${p.price},${p.currency}`
    );
    const csvContent = [csvHeader, ...csvRows].join('\n');

    console.log(`\n--- ${siteName.toUpperCase()} JSON ---`);
    console.log(`File: src/data/products-${siteName}.json`);
    console.log(JSON.stringify(jsonData, null, 2));

    console.log(`\n--- ${siteName.toUpperCase()} CSV ---`);
    console.log(`File: src/data/products-${siteName}.csv`);
    console.log(csvContent);
  });

  console.log('\n=== Discovery Complete ===');
}
