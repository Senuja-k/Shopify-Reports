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

      loadStores: async (options) => {
        // Prevent concurrent calls
        if (get().isLoading && !options?.force) {
          console.log('[storeManagement] loadStores already in progress, skipping');
          return;
        }
        // Only load if authenticated
        const isAuthenticated = useAuth.getState().isAuthenticated;
        if (!isAuthenticated) {
          console.log('[storeManagement] Not authenticated, skipping loadStores');
          set({ stores: [], isLoading: false });
          return;
        }
        console.log('[storeManagement] loadStores started');
        set({ isLoading: true });
        try {
          // Use persisted user from authStore instead of async getSession (avoids tab-switching hangs)
          const user = useAuth.getState().user;
          console.log('[storeManagement] Got user from authStore:', user?.id || 'none');
          
          if (!user) {
            console.log('[storeManagement] No user, clearing stores');
            set({ stores: [], isLoading: false });
            return;
          }
          const organizationId = useOrganization.getState().activeOrganizationId;
          if (!organizationId) {
            console.log('[storeManagement] No organization, clearing stores');
            set({ stores: [], isLoading: false });
            return;
          }
          console.log('[storeManagement] Fetching stores for org:', organizationId);
          const stores = await getStores(user.id, organizationId);
          console.log('[storeManagement] Got', stores.length, 'stores');
          const selectedStoreId = get().selectedStoreId;
          const hasSelected = selectedStoreId ? stores.some((s) => s.id === selectedStoreId) : false;
          set({
            stores: stores,
            isLoading: false,
            selectedStoreId: hasSelected ? selectedStoreId : null,
          });
          console.log('[storeManagement] loadStores complete, isLoading now false');
        } catch (error) {
          console.error('[storeManagement] Error loading stores:', error);
          set({ isLoading: false });
        }
      },

      addStore: async (store) => {
        console.log('[storeManagement] addStore called:', store.name);
        const user = useAuth.getState().user;
        if (!user) {
          throw new Error('User not authenticated');
        }

        const organizationId = useOrganization.getState().activeOrganizationId;
        if (!organizationId) {
          throw new Error('No active organization selected');
        }

        set({ isLoading: true });
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
          set((state) => {
            const updatedStores = [...state.stores, newStore];
            console.log('[storeManagement] Updated stores count:', updatedStores.length);
            return {
              stores: updatedStores,
              isLoading: false,
            };
          });
          console.log('[storeManagement] addStore complete');
        } catch (error) {
          console.error('[storeManagement] Error adding store:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      removeStore: async (id) => {
        const user = useAuth.getState().user;
        if (!user) {
          throw new Error('User not authenticated');
        }

        const organizationId = useOrganization.getState().activeOrganizationId;
        if (!organizationId) {
          throw new Error('No active organization selected');
        }

        set({ isLoading: true });
        try {
          await deleteStoreFromSupabase(user.id, organizationId, id);
          set((state) => ({
            stores: state.stores.filter((s) => s.id !== id),
            selectedStoreId: state.selectedStoreId === id ? null : state.selectedStoreId,
            isLoading: false,
          }));
        } catch (error) {
          console.error('Error removing store:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      updateStore: async (id, updates) => {
        const user = useAuth.getState().user;
        if (!user) {
          throw new Error('User not authenticated');
        }

        const organizationId = useOrganization.getState().activeOrganizationId;
        if (!organizationId) {
          throw new Error('No active organization selected');
        }

        set({ isLoading: true });
        try {
          await updateStoreInSupabase(user.id, organizationId, id, updates);
          set((state) => ({
            stores: state.stores.map((s) =>
              s.id === id ? { ...s, ...updates } : s
            ),
            isLoading: false,
          }));
        } catch (error) {
          console.error('Error updating store:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      setSelectedStore: (id) => set({ selectedStoreId: id }),
      setViewMode: (mode) => set({ viewMode: mode }),
      clearStores: () => {
        console.log('[storeManagement] Clearing all stores');
        set({ stores: [], selectedStoreId: null, viewMode: 'combined', isLoading: false });
      },
    }),
    {
      name: 'shopify-stores',
      // Only persist stores and selection, NOT loading state
      partialize: (state) => ({
        stores: state.stores,
        selectedStoreId: state.selectedStoreId,
        viewMode: state.viewMode,
      }),
      // Reset isLoading when rehydrating from storage to prevent stuck state
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);
