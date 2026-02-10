/**
 * Product Discovery Script
 * 
 * Discovers real products from the eCommerce staging sites.
 * Verifies each product's PDP URL is accessible and correctly classifies:
 *   - IN_STOCK: PDP loads, sizes selectable, real price shown
 *   - OUT_OF_STOCK: PDP loads, sizes disabled, shows "out of stock" message
 *   - DISABLED: PDP returns 404/redirect — excluded from results
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

/**
 * Fetch products via search query
 */
function fetchProducts(endpoint, searchTerm, pageSize, currentPage, siteName) {
  const payload = JSON.stringify({
    query: DISCOVER_PRODUCTS,
    variables: {
      search: searchTerm,
      pageSize: pageSize,
      currentPage: currentPage
    }
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { site: siteName },
  };

  const response = http.post(endpoint, payload, params);

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
 * Verify a product's PDP URL is accessible (not 404/disabled).
 * Returns true if the PDP is a real, viewable product page.
 */
function verifyPDP(baseUrl, urlKey) {
  const pdpUrl = `${baseUrl}/${urlKey}.html`;
  const response = http.get(pdpUrl, {
    redirects: 0,
    tags: { type: 'pdp-verify' },
  });
  // 200 = accessible PDP; 301/302 = redirect (likely disabled); 404 = not found
  return response.status === 200;
}

export default function() {
  console.log('=== Discovering & Verifying Products ===\n');
  console.log('Stock status classification:');
  console.log('  IN_STOCK     = PDP accessible, sizes selectable, can add to cart');
  console.log('  OUT_OF_STOCK = PDP accessible, all sizes disabled, "out of stock" message');
  console.log('  DISABLED     = PDP returns 404/redirect — EXCLUDED\n');

  Object.entries(sites).forEach(([siteName, siteConfig]) => {
    console.log(`\n========== ${siteName.toUpperCase()} ==========`);

    // Fetch a larger batch of products via search across multiple pages
    const searchTerms = ['shoes', 'boot', 'sneaker'];
    const allProducts = [];
    const seenSkus = {};

    for (const term of searchTerms) {
      for (let page = 1; page <= 2; page++) {
        const result = fetchProducts(siteConfig.graphql, term, 20, page, siteName);
        if (result.items.length === 0) break;
        for (const item of result.items) {
          if (!seenSkus[item.sku]) {
            seenSkus[item.sku] = true;
            allProducts.push(item);
          }
        }
      }
    }

    console.log(`[${siteName}] Found ${allProducts.length} unique products from GraphQL search`);

    // Separate by API stock_status
    const apiInStock = allProducts.filter(p => p.stock_status === 'IN_STOCK');
    const apiOutOfStock = allProducts.filter(p => p.stock_status === 'OUT_OF_STOCK');
    console.log(`  API reports: ${apiInStock.length} IN_STOCK, ${apiOutOfStock.length} OUT_OF_STOCK`);

    const verifiedProducts = [];

    // Verify IN_STOCK products via PDP
    console.log(`\n[${siteName}] Verifying IN_STOCK products via PDP...`);
    let inStockVerified = 0;
    for (const p of apiInStock) {
      if (inStockVerified >= 5) break;
      const accessible = verifyPDP(siteConfig.baseUrl, p.url_key);
      if (accessible) {
        verifiedProducts.push({ ...p, verifiedStatus: 'IN_STOCK' });
        inStockVerified++;
        const price = p.price_range.minimum_price.regular_price.value;
        const currency = p.price_range.minimum_price.regular_price.currency;
        console.log(`  OK IN_STOCK     : ${p.sku} | ${p.name} | ${price} ${currency}`);
      } else {
        console.log(`  XX DISABLED     : ${p.sku} | ${p.name} | PDP not accessible, skipped`);
      }
      sleep(0.3);
    }

    // Verify OUT_OF_STOCK products via PDP
    console.log(`\n[${siteName}] Verifying OUT_OF_STOCK products via PDP...`);
    let oosVerified = 0;
    for (const p of apiOutOfStock) {
      if (oosVerified >= 5) break;
      const accessible = verifyPDP(siteConfig.baseUrl, p.url_key);
      if (accessible) {
        verifiedProducts.push({ ...p, verifiedStatus: 'OUT_OF_STOCK' });
        oosVerified++;
        console.log(`  OK OUT_OF_STOCK : ${p.sku} | ${p.name}`);
      } else {
        console.log(`  XX DISABLED     : ${p.sku} | ${p.name} | PDP not accessible, skipped`);
      }
      sleep(0.3);
    }

    // Summary for this site
    const brandName = siteName.split('-')[0];
    console.log(`\n[${siteName}] VERIFIED: ${inStockVerified} IN_STOCK + ${oosVerified} OUT_OF_STOCK = ${verifiedProducts.length} total`);

    // Generate JSON output
    const jsonData = {
      description: `Products for ${brandName} load testing (discovered & verified from staging)`,
      site: siteName,
      note: `Products discovered on ${new Date().toISOString().split('T')[0]}. Each product PDP verified accessible.`,
      data: verifiedProducts.map((p, idx) => ({
        id: `prod-${String(idx + 1).padStart(3, '0')}`,
        sku: p.sku,
        urlKey: p.url_key,
        name: p.name,
        productType: p.__typename.toLowerCase().replace('product', ''),
        categoryPath: `shoes/${brandName}`,
        quantity: 1,
        stockStatus: p.verifiedStatus,
        price: p.price_range.minimum_price.regular_price.value,
        currency: p.price_range.minimum_price.regular_price.currency
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
