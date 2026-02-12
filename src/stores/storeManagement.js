import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveStore, getStores, updateStoreInSupabase, deleteStoreFromSupabase } from '@/lib/supabase-utils';
import { useOrganization } from '@/stores/organizationStore';
import { useAuth } from '@/stores/authStore.jsx';

export const useStoreManagement = create()(
  persist(
    (set, get) => ({
      stores: [],
      selectedStoreId: null,
      viewMode: 'combined',
      isLoading: false,
      error: null, // ✅ NEW

      // ✅ UPDATED: accepts options { organizationId, force }
      loadStores: async (options = {}) => {
        const { organizationId: orgFromCaller, force = false } = options;

        // Prevent concurrent calls
        if (get().isLoading && !force) {
          console.log('[storeManagement] loadStores already in progress, skipping');
          return;
        }

        // Only load if authenticated
        const isAuthenticated = useAuth.getState().isAuthenticated;
        if (!isAuthenticated) {
          console.log('[storeManagement] Not authenticated, clearing stores');
          set({ stores: [], isLoading: false, error: null });
          return;
        }

        console.log('[storeManagement] loadStores started');
        set({ isLoading: true, error: null });

        try {
          // Use persisted user from authStore instead of async getSession
          const user = useAuth.getState().user;
          console.log('[storeManagement] Got user from authStore:', user?.id || 'none');

          if (!user) {
            // ✅ Don’t wipe persisted stores (auth may still hydrate)
            console.log('[storeManagement] No user yet, skipping store fetch');
            return;
          }

          // ✅ Prefer org passed from caller
          const organizationId = orgFromCaller ?? useOrganization.getState().activeOrganizationId;

          if (!organizationId) {
            // ✅ IMPORTANT: do NOT clear stores here (this caused “No stores connected”)
            console.log('[storeManagement] No organization yet, skipping store fetch');
            return;
          }

          console.log('[storeManagement] Fetching stores for org:', organizationId);
          const stores = await getStores(user.id, organizationId);
          console.log('[storeManagement] Got', stores.length, 'stores');

          const selectedStoreId = get().selectedStoreId;
          const hasSelected = selectedStoreId ? stores.some((s) => s.id === selectedStoreId) : false;

          set({
            stores,
            selectedStoreId: hasSelected ? selectedStoreId : null,
          });

          console.log('[storeManagement] loadStores complete');
        } catch (error) {
          console.error('[storeManagement] Error loading stores:', error);
          set({ error: error?.message || 'Failed to load stores' });
        } finally {
          set({ isLoading: false });
        }
      },

      addStore: async (store) => {
        console.log('[storeManagement] addStore called:', store.name);
        const user = useAuth.getState().user;
        if (!user) throw new Error('User not authenticated');

        const organizationId = useOrganization.getState().activeOrganizationId;
        if (!organizationId) throw new Error('No active organization selected');

        set({ isLoading: true, error: null });
        try {
          const newStore = {
            ...store,
            id: crypto.randomUUID(),
            organizationId,
            createdAt: new Date().toISOString(),
          };

          console.log('[storeManagement] Saving store to database...');
          await saveStore(user.id, organizationId, newStore);

          console.log('[storeManagement] Store saved, updating local state...');
          set((state) => ({
            stores: [...state.stores, newStore],
          }));

          console.log('[storeManagement] addStore complete');
        } catch (error) {
          console.error('[storeManagement] Error adding store:', error);
          set({ error: error?.message || 'Failed to add store' });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      removeStore: async (id) => {
        const user = useAuth.getState().user;
        if (!user) throw new Error('User not authenticated');

        const organizationId = useOrganization.getState().activeOrganizationId;
        if (!organizationId) throw new Error('No active organization selected');

        set({ isLoading: true, error: null });
        try {
          await deleteStoreFromSupabase(user.id, organizationId, id);
          set((state) => ({
            stores: state.stores.filter((s) => s.id !== id),
            selectedStoreId: state.selectedStoreId === id ? null : state.selectedStoreId,
          }));
        } catch (error) {
          console.error('Error removing store:', error);
          set({ error: error?.message || 'Failed to remove store' });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      updateStore: async (id, updates) => {
        const user = useAuth.getState().user;
        if (!user) throw new Error('User not authenticated');

        const organizationId = useOrganization.getState().activeOrganizationId;
        if (!organizationId) throw new Error('No active organization selected');

        set({ isLoading: true, error: null });
        try {
          await updateStoreInSupabase(user.id, organizationId, id, updates);
          set((state) => ({
            stores: state.stores.map((s) => (s.id === id ? { ...s, ...updates } : s)),
          }));
        } catch (error) {
          console.error('Error updating store:', error);
          set({ error: error?.message || 'Failed to update store' });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      setSelectedStore: (id) => set({ selectedStoreId: id }),
      setViewMode: (mode) => set({ viewMode: mode }),

      clearStores: () => {
        console.log('[storeManagement] Clearing all stores');
        set({ stores: [], selectedStoreId: null, viewMode: 'combined', isLoading: false, error: null });
      },
    }),
    {
      name: 'shopify-stores',
      partialize: (state) => ({
        stores: state.stores,
        selectedStoreId: state.selectedStoreId,
        viewMode: state.viewMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.isLoading = false;
      },
    }
  )
);
