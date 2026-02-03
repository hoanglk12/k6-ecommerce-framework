/**
 * Product Discovery Script
 * 
 * Discovers real products from the eCommerce sites
 */

import http from 'k6/http';

const sites = {
  platypus: 'https://www.platypusshoes.com.au/graphql',
  skechers: 'https://www.skechers.com.au/graphql'
};

// Query to discover products
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

export default function() {
  console.log('=== Discovering Products ===\n');
  
  Object.entries(sites).forEach(([siteName, endpoint]) => {
    console.log(`\n--- ${siteName.toUpperCase()} ---`);
    
    const payload = JSON.stringify({
      query: DISCOVER_PRODUCTS,
      variables: {
        search: "shoes",
        pageSize: 10,
        currentPage: 1
      }
    });
    
    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { site: siteName },
    };
    
    const response = http.post(endpoint, payload, params);
    
    if (response.status === 200) {
      const data = JSON.parse(response.body);
      
      if (data.errors) {
        console.error(`GraphQL Errors: ${JSON.stringify(data.errors, null, 2)}`);
        return;
      }
      
      if (data.data && data.data.products) {
        const products = data.data.products.items;
        const totalCount = data.data.products.total_count;
        
        console.log(`Total products: ${totalCount}`);
        console.log(`\nFirst 10 products:`);
        console.log(JSON.stringify(products, null, 2));
        
        console.log(`\n=== Copy these SKUs to your test data ===`);
        products.forEach(p => {
          console.log(`{ "sku": "${p.sku}", "name": "${p.name}", "type": "${p.__typename}", "stock_status": "${p.stock_status}" }`);
        });
      } else {
        console.error('Unexpected response structure');
        console.log(response.body);
      }
    } else {
      console.error(`HTTP Error: ${response.status}`);
      console.error(response.body);
    }
  });
}
