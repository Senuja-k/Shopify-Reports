const SHOPIFY_API_VERSION = '2025-07';

import { supabase } from './supabase';
import { flattenProductsWithVariants } from './flattenVariants';

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          description
          handle
          vendor
          productType
          createdAt
          updatedAt
          publishedAt
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 1) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 250) {
            edges {
              node {
                id
                title
                sku
                barcode
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Admin API query - includes inventory data, SKU, barcode, and metafields
const ADMIN_PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          description
          handle
          vendor
          productType
          status
          createdAt
          updatedAt
          publishedAt
          totalInventory
          images(first: 1) {
            edges {
              node {
                url
                altText
              }
            }
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 250) {
            edges {
              node {
                id
                title
                sku
                barcode
                price
                compareAtPrice
              }
            }
          }
          metafields(first: 250) {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    }
  }
`;

// Get Admin API token from stores table
async function getAdminTokenForStore(domain, organizationId) {
  try {
    const user = await supabase.auth.getUser();
    if (!user.data.user) {
      console.log('[getAdminTokenForStore] No user authenticated');
      return null;
    }

    console.log('[getAdminTokenForStore] Looking for token for domain:', domain, 'user:', user.data.user.id);

    // Normalize domain - remove www, remove protocol, remove trailing slash
    let normalizedDomain = domain.toLowerCase().replace(/^https:\/\//, '').replace(/www\./, '').replace(/\/$/, '');
    console.log('[getAdminTokenForStore] Normalized domain:', normalizedDomain);

    // First try exact match
    let query = supabase
      .from('stores')
      .select('admin_token, domain')
      .eq('user_id', user.data.user.id)
      .eq('domain', normalizedDomain);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    let { data, error } = await query.single();

    if (error && error.code === 'PGRST116') {
      // No rows found - try with .myshopify.com suffix if not present
      console.log('[getAdminTokenForStore] No exact match found, trying variations...');
      
      if (!normalizedDomain.includes('.myshopify.com')) {
        const shopifyDomain = `${normalizedDomain}.myshopify.com`;
        console.log('[getAdminTokenForStore] Trying with .myshopify.com suffix:', shopifyDomain);
        
        let resultQuery = supabase
          .from('stores')
          .select('admin_token, domain')
          .eq('user_id', user.data.user.id)
          .eq('domain', shopifyDomain);

        if (organizationId) {
          resultQuery = resultQuery.eq('organization_id', organizationId);
        }

        const result = await resultQuery.single();
        
        data = result.data;
        error = result.error;
      }
    }

    if (error) {
      console.log('[getAdminTokenForStore] Query error:', error);
      return null;
    }
    
    if (!data) {
      console.log('[getAdminTokenForStore] No record found');
      return null;
    }
    
    console.log('[getAdminTokenForStore] Found admin token for', data.domain);
    return data.admin_token;
  } catch (error) {
    console.error('[getAdminTokenForStore] Failed to get Admin token:', error);
    return null;
  }
}

async function storefrontApiRequest(
  storeConfig,
  query,
  variables = {},
  retries = 3
) {
  const storefrontUrl = `https://${storeConfig.domain}/api/${SHOPIFY_API_VERSION}/graphql.json`;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(storefrontUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': storeConfig.storefrontToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error status: ${response.status}`);
      }

      const data = await response.json();

      if (data.errors) {
        const errorMessage = data.errors.map((e) => e.message).join(', ');
        
        // Check if it's a rate limit error
        if (errorMessage.includes('Throttled') && attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Rate limited. Retrying in ${delay}ms... (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw new Error(`Error calling Shopify: ${errorMessage}`);
      }

      return data;
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }
      
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Request failed. Retrying in ${delay}ms... (attempt ${attempt + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Admin API request function - uses Supabase Edge Function to avoid CORS issues
async function adminApiRequest(
  storeConfig,
  query,
  variables = {},
  retries = 3
) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/shopify-admin-api`;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          shop: storeConfig.domain,
          query,
          variables,
          accessToken: storeConfig.adminToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error status: ${response.status}`);
      }

      const data = await response.json();

      if (data.errors) {
        const errorMessage = data.errors.map((e) => e.message).join(', ');
        
        // Check if it's a rate limit error
        if (errorMessage.includes('Throttled') && attempt < retries - 1) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Rate limited. Retrying in ${delay}ms... (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw new Error(`Error calling Shopify: ${errorMessage}`);
      }

      return data;
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }
      
      // For network errors, also retry with backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Request failed. Retrying in ${delay}ms... (attempt ${attempt + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}

export async function fetchProductsFromStore(storeConfig) {
  const allProducts = [];
  let hasNextPage = true;
  let cursor = null;
  
  console.log('[fetchProductsFromStore] Starting fetch for store:', storeConfig.name, 'domain:', storeConfig.domain);
  
  // Add a small delay to avoid overwhelming the API
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Try to get Admin token from shopify_stores table first
  let adminToken = storeConfig.adminToken;
  if (!adminToken) {
    console.log('[fetchProductsFromStore] No admin token in config, fetching from shopify_stores...');
    adminToken = await getAdminTokenForStore(storeConfig.domain, storeConfig.organizationId);
  }
  
  // Use Admin API if available, otherwise fall back to Storefront API
  const useAdminApi = !!adminToken;
  console.log('[fetchProductsFromStore] Using', useAdminApi ? 'Admin API' : 'Storefront API', 'for', storeConfig.name);
  
  const query = useAdminApi ? ADMIN_PRODUCTS_QUERY : PRODUCTS_QUERY;
  const apiRequest = useAdminApi ? adminApiRequest : storefrontApiRequest;
  
  // Create config with admin token if available
  const configWithToken = {
    ...storeConfig,
    adminToken,
  };

  while (hasNextPage) {
    // Increase batch size to 250 (Shopify's max for Admin API)
    const variables = { first: 250 };
    if (cursor) variables.after = cursor;

    console.log(`%c[fetchProductsFromStore] Fetching batch (cursor: ${cursor ? 'yes' : 'initial'}), total so far: ${allProducts.length}`, 'color: cyan');
    const data = await apiRequest(configWithToken, query, variables);
    const products = data.data.products;
    
    console.log(`%c[fetchProductsFromStore] Received ${products.edges.length} products, hasNextPage: ${products.pageInfo.hasNextPage}, total accumulated: ${allProducts.length + products.edges.length}`, 'color: cyan');

    for (const edge of products.edges) {
      const product = edge.node;
      
      // Use totalInventory from product (Admin API provides this)
      const totalInventory = product.totalInventory || 0;

      // Convert GraphQL edges format to arrays for easier processing
      const variantsArray = product.variants?.edges?.map((edge) => edge.node) || [];
      const metafieldsArray = product.metafields?.edges?.map((edge) => edge.node) || [];
      
      // Log variants with their SKUs for debugging
      const skus = variantsArray.map((v) => v.sku).filter(Boolean);
      if (skus.length > 0) {
        console.log(`[fetchProductsFromStore] Product "${product.title}" SKUs: ${skus.join(', ')}`);
      }
      
      // Log if product has many variants or might be truncated
      if (variantsArray.length >= 250) {
        console.warn(`[fetchProductsFromStore] ?? Product "${product.title}" has ${variantsArray.length} variants (may be truncated at API limit)`);
      }
      
      console.log(`[fetchProductsFromStore] Product ${product.title}: ${variantsArray.length} variants, status: ${product.status}`);

      // Use the product data as-is from Admin API (it has all the fields we need)
      const normalizedProduct = {
        id: product.id,
        title: product.title,
        description: product.description || '',
        handle: product.handle || '',
        vendor: product.vendor || '',
        productType: product.productType || '',
        status: product.status || 'UNKNOWN',
        createdAt: product.createdAt || new Date().toISOString(),
        updatedAt: product.updatedAt || new Date().toISOString(),
        publishedAt: product.publishedAt || new Date().toISOString(),
        priceRange: product.priceRange || {
          minVariantPrice: { amount: '0', currencyCode: 'USD' },
          maxVariantPrice: { amount: '0', currencyCode: 'USD' },
        },
        totalInventory,
        images: product.images || { edges: [] },
        // Convert GraphQL edges format to arrays for easier processing
        variants: variantsArray,
        metafields: metafieldsArray,
      };

      allProducts.push({
        ...normalizedProduct,
        storeName: storeConfig.name,
        storeId: storeConfig.id,
      });
    }

    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  // Flatten products with variants - one row per variant
  const flattenedProducts = flattenProductsWithVariants(allProducts);
  console.log(`%c[fetchProductsFromStore] ?? COMPLETE: Fetched ${allProducts.length} products from Shopify API`, 'background: purple; color: white; font-weight: bold; font-size: 14px');
  console.log(`%c[fetchProductsFromStore] ?? Flattened into ${flattenedProducts.length} variant rows`, 'background: purple; color: white; font-weight: bold; font-size: 14px');
  console.log(`[fetchProductsFromStore] Product titles fetched:`, allProducts.map(p => p.title).slice(0, 10));
  if (allProducts.length > 10) {
    console.log(`[fetchProductsFromStore] ... and ${allProducts.length - 10} more products`);
  }
  
  return flattenedProducts;
}

export async function fetchAllProductsFromStores(
  stores
) {
  const results = await Promise.allSettled(
    stores.map((store) => fetchProductsFromStore(store))
  );

  const allProducts = [];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allProducts.push(...result.value);
    } else {
      console.error(`Failed to fetch from ${stores[index].name}:`, result.reason);
    }
  });

  // Products are already flattened by fetchProductsFromStore, no need to flatten again
  console.log(`[fetchAllProductsFromStores] Total products from all stores: ${allProducts.length}`);
  
  return allProducts;
}
