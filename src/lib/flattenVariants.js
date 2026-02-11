/**
 * Flattens an array of products with variants into a flat array of rows.
 * 
 * For each product:
 * - If it has variants, creates one row per variant with product-level fields + variant-specific fields
 * - If it has no variants, creates a single row with variant fields/undefined
 * 
 * @param products Array of Shopify products (already normalized, with variants array)
 * @returns Flat array of ProductRow, one per variant
 */
export function flattenProductsWithVariants(products) {
  const rows = [];

  products.forEach((product) => {
    const variants = product.variants;

    if (variants && Array.isArray(variants) && variants.length > 0) {
      // Create one row for each variant
      variants.forEach((variant) => {
        const row = {
          ...product,
          // Variant-specific fields
          variantId: variant.id || '',
          variantTitle: variant.title || undefined,
          variantSku: variant.sku || undefined,
          variantBarcode: variant.barcode || undefined,
          // Handle price - could be string or object with amount property
          variantPrice: 
            typeof variant.price === 'string' 
              ? variant.price 
              : variant.price?.amount || variant.price,
          // Handle compareAtPrice - could be string or object with amount property
          compareAtPrice:
            typeof variant.compareAtPrice === 'string'
              ? variant.compareAtPrice
              : variant.compareAtPrice?.amount || variant.compareAtPrice,
          // Back-compat fields used by existing columns
          sku: variant.sku || undefined,
          barcode: variant.barcode || undefined,
          price: typeof variant.price === 'string' ? variant.price : variant.price?.amount || variant.price,
        };

        if (!variant.sku) {
          console.warn(`[flattenVariants] Product "${product.title}" variant "${variant.title}" has no SKU. Variant data:`, variant);
        }

        rows.push(row);
      });
    } else {
      // Product has no variants - create a single row with variant fields undefined
      const row = {
        ...product,
        variantId: undefined,
        variantTitle: undefined,
        variantSku: undefined,
        variantBarcode: undefined,
        variantPrice: undefined,
        compareAtPrice: undefined,
        sku: undefined,
        barcode: undefined,
        price: undefined,
      };

      rows.push(row);
    }
  });

  return rows;
}
