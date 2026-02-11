import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Products are kept in memory only (not persisted to localStorage/IndexedDB).
// On mount, Index.jsx fetches from the Supabase DB if products are empty.
// Switching tabs/windows does NOT lose data since the Zustand store is a
// singleton that lives for the lifetime of the page.
// On a full page reload, products are re-fetched from DB (fast, server-side cache).
export const useProductsStore = create(
  persist(
    (set) => ({
      products: [],
      lastSyncAt: null,
      setProducts: (products) => set({ products }),
      setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
      clearProducts: () => set({ products: [], lastSyncAt: null }),
    }),
    {
      name: 'products-store', // unique key in storage
      // Persist only small metadata to avoid localStorage quota issues
      partialize: (state) => ({ lastSyncAt: state.lastSyncAt }),
      // Reset isLoading-like values when rehydrating
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Nothing to reset here, but keep hook for future use
        }
      },
    }
  )
);

// Clean up any stale localStorage entry from the old persisted store
try { localStorage.removeItem('products-store'); } catch (_) {}
