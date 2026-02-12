import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Cache one "last view" (simple + effective)
export const useProductsPageCacheStore = create()(
  persist(
    (set, get) => ({
      cacheKey: null,
      cachedAt: null,
      pageProducts: [],
      totalCount: 0,
      stats: { totalProducts: 0, totalStores: 0, totalVendors: 0, totalTypes: 0, avgPrice: 0 },

      setCache: ({ cacheKey, pageProducts, totalCount, stats }) =>
        set({
          cacheKey,
          cachedAt: new Date().toISOString(),
          pageProducts,
          totalCount,
          stats,
        }),

      clearCache: () =>
        set({
          cacheKey: null,
          cachedAt: null,
          pageProducts: [],
          totalCount: 0,
          stats: { totalProducts: 0, totalStores: 0, totalVendors: 0, totalTypes: 0, avgPrice: 0 },
        }),
    }),
    { name: 'products-page-cache' }
  )
);
