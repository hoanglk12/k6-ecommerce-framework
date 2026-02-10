/**
 * Parse discovered products and update product data files
 */

const fs = require('fs');

// Read and parse the discovered products output
const output = fs.readFileSync('products-discovered.txt', 'utf8');

// Extract products for each site
const platypusProducts = [];
const skechersProducts = [];

// Parse Platypus products
const platypusSection = output.match(/---\s*PLATYPUS\s*---[\s\S]*?(?=---\s*SKECHERS\s*---|$)/);
if (platypusSection) {
  const skuMatches = platypusSection[0].matchAll(/{\s*"sku":\s*"([^"]+)",\s*"name":\s*"([^"]+)",\s*"type":\s*"([^"]+)",\s*"stock_status":\s*"([^"]+)"\s*}/g);
  let id = 1;
  for (const match of skuMatches) {
    const [_, sku, name, type, stockStatus] = match;
    if (stockStatus === 'IN_STOCK') {
      platypusProducts.push({
        id: `prod-${String(id).padStart(3, '0')}`,
        sku: sku,
        urlKey: sku.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: name,
        productType: type === 'ConfigurableProduct' ? 'configurable' : 'simple',
        categoryPath: 'shoes',
        quantity: 1,
        expectedPrice: {
          min: 50,
          max: 300
        }
      });
      id++;
    }
  }
}

// Parse Skechers products
const skechersSection = output.match(/---\s*SKECHERS\s*---[\s\S]*/);
if (skechersSection) {
  const skuMatches = skechersSection[0].matchAll(/{\s*"sku":\s*"([^"]+)",\s*"name":\s*"([^"]+)",\s*"type":\s*"([^"]+)",\s*"stock_status":\s*"([^"]+)"\s*}/g);
  let id = 1;
  for (const match of skuMatches) {
    const [_, sku, name, type, stockStatus] = match;
    if (stockStatus === 'IN_STOCK') {
      skechersProducts.push({
        id: `prod-${String(id).padStart(3, '0')}`,
        sku: sku,
        urlKey: sku.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: name,
        productType: type === 'ConfigurableProduct' ? 'configurable' : 'simple',
        categoryPath: 'shoes',
        quantity: 1,
        expectedPrice: {
          min: 50,
          max: 300
        }
      });
      id++;
    }
  }
}

console.log(`Found ${platypusProducts.length} in-stock Platypus products`);
console.log(`Found ${skechersProducts.length} in-stock Skechers products`);

// Update Platypus products file
if (platypusProducts.length > 0) {
  const platypusData = {
    description: "Real products from Platypus Shoes staging environment",
    site: "platypus",
    note: "Products discovered from staging GraphQL API - IN_STOCK items only",
    lastUpdated: new Date().toISOString(),
    data: platypusProducts
  };
  
  fs.writeFileSync(
    'src/data/products-platypus.json',
    JSON.stringify(platypusData, null, 2),
    'utf8'
  );
  console.log('✓ Updated src/data/products-platypus.json');
}

// Update Skechers products file
if (skechersProducts.length > 0) {
  const skechersData = {
    description: "Real products from Skechers Australia staging environment",
    site: "skechers",
    note: "Products discovered from staging GraphQL API - IN_STOCK items only",
    lastUpdated: new Date().toISOString(),
    data: skechersProducts
  };
  
  fs.writeFileSync(
    'src/data/products-skechers.json',
    JSON.stringify(skechersData, null, 2),
    'utf8'
  );
  console.log('✓ Updated src/data/products-skechers.json');
}

console.log('\n✓ Product data files updated successfully');
