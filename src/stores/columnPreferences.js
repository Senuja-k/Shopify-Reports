import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveColumnPreferences, getColumnPreferences } from '@/lib/supabase-utils';
import { auth } from '@/lib/supabase';

export const useColumnPreferences = create()(
  persist(
    (set, get) => ({
      preferences: new Map(),
      isLoading: false,

      loadPreferences: async () => {
        const session = await auth.getSession();
        const user = session.data.session?.user;
        if (!user) {
          set({ preferences: new Map() });
          return;
        }

        set({ isLoading: true });
        try {
          const preferences = await getColumnPreferences(user.id);
          set({ preferences, isLoading: false });
        } catch (error) {
          console.error('Failed to load column preferences:', error);
          set({ isLoading: false });
        }
      },

      setColumnVisibility: async (key, visible) => {
        const session = await auth.getSession();
        const user = session.data.session?.user;
        
        set((state) => {
          const newPrefs = new Map(state.preferences);
          const existing = newPrefs.get(key);
          if (existing) {
            newPrefs.set(key, { ...existing, visible });
          } else {
            newPrefs.set(key, { key, visible, order: newPrefs.size });
          }
          return { preferences: newPrefs };
        });

        if (user) {
          try {
            const newPrefs = get().preferences;
            await saveColumnPreferences(user.id, newPrefs);
          } catch (error) {
            console.error('Failed to save column visibility:', error);
          }
        }
      },

      updateColumnOrder: async (key, newOrder) => {
        const session = await auth.getSession();
        const user = session.data.session?.user;
        
        set((state) => {
          const newPrefs = new Map(state.preferences);
          const current = newPrefs.get(key);
          if (current) {
            newPrefs.set(key, { ...current, order: newOrder });
          }
          return { preferences: newPrefs };
        });

        if (user) {
          try {
            const newPrefs = get().preferences;
            await saveColumnPreferences(user.id, newPrefs);
          } catch (error) {
            console.error('Failed to save column order:', error);
          }
        }
      },

      setColumnOrder: async (columns) => {
        const session = await auth.getSession();
        const user = session.data.session?.user;
        
        set(() => {
          const newPrefs = new Map();
          columns.forEach((col, index) => {
            newPrefs.set(col.key, { ...col, order: index });
          });
          return { preferences: newPrefs };
        });

        if (user) {
          try {
            const newPrefs = get().preferences;
            await saveColumnPreferences(user.id, newPrefs);
          } catch (error) {
            console.error('Failed to save column order:', error);
          }
        }
      },

      resetPreferences: async () => {
        const session = await auth.getSession();
        const user = session.data.session?.user;
        
        set({ preferences: new Map() });

        if (user) {
          try {
            await saveColumnPreferences(user.id, new Map());
          } catch (error) {
            console.error('Failed to reset preferences:', error);
          }
        }
      },

      initializePreferences: (detectedColumns) => {
        set((state) => {
          let newPrefs;
          if (Array.isArray(state.preferences)) {
            newPrefs = new Map(state.preferences);
          } else if (state.preferences instanceof Map) {
            newPrefs = new Map(state.preferences);
          } else {
            newPrefs = new Map();
          }

          // Add any new columns that aren't in preferences yet
          detectedColumns.forEach((col, index) => {
            if (!newPrefs.has(col.key)) {
              newPrefs.set(col.key, {
                key: col.key,
                visible: col.visible,
                order: newPrefs.size + index,
              });
            }
          });

          return { preferences: newPrefs };
        });
      },
    }),
    {
      name: 'column-preferences',
      storage: {
        getItem: (name) => {
          const item = localStorage.getItem(name);
          if (!item) return null;
          try {
            const data = JSON.parse(item);
            // Convert array back to Map
            if (data.state?.preferences && Array.isArray(data.state.preferences)) {
              data.state.preferences = new Map(data.state.preferences);
            }
            return data;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          const data = {
            ...value,
            state: value.state,
          };
          localStorage.setItem(name, JSON.stringify(data));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
