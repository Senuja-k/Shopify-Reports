import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';

const MAX_CACHE_ENTRIES = 5;

const idbStorage = {
  getItem: async (name) => {
    const value = await get(name);
    return value ?? null;
  },
  setItem: async (name, value) => {
    await set(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  },
};

export const useProductCache = create()(
  persist(
    (set, get) => ({
      cache: {},
      getEntry: (key) => {
        const entry = get().cache[key];
        console.log('[productCache] getEntry', key, entry ? `found ${entry.products.length} products` : 'not found');
        return entry;
      },
      setEntry: (key, entry) => {
        console.log('[productCache] setEntry', key, `${entry.products.length} products`);
        return set((state) => {
          const next = {
            ...state.cache,
            [key]: entry,
          };

          const keys = Object.keys(next);
          if (keys.length > MAX_CACHE_ENTRIES) {
            const sorted = keys
              .map((k) => ({ k, updatedAt: next[k]?.updatedAt || '' }))
              .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0));

            const toRemove = keys.length - MAX_CACHE_ENTRIES;
            for (let i = 0; i < toRemove; i += 1) {
              delete next[sorted[i].k];
            }
          }

          return { cache: next };
        });
      },
      clearEntry: (key) => set((state) => {
          const next = { ...state.cache };
          delete next[key];
          return { cache: next };
        }),
      clearAll: () => set({ cache: {} }),
    }),
    {
      name: 'product-cache',
      storage: createJSONStorage(() => idbStorage),
    }
  )
);
