import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { auth } from '@/lib/supabase';
import { useAuth } from '@/stores/authStore.jsx';
import {
  addOrganizationMemberByEmail,
  createOrganizationForUser,
  deleteOrganization as deleteOrganizationFromSupabase,
  getOrganizationMembers,
  getOrganizationsForUser,
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from '@/lib/supabase-utils';

export const useOrganization = create(
  persist(
    (set, get) => ({
      organizations: [],
      activeOrganizationId: null,
      members: [],
      isLoading: false,

      loadOrganizations: async () => {
        // Prevent concurrent calls
        if (get().isLoading) {
          console.log('[organizationStore] loadOrganizations already in progress, skipping');
          return;
        }
        // Only load if authenticated
        const isAuthenticated = useAuth.getState().isAuthenticated;
        if (!isAuthenticated) {
          console.log('[organizationStore] Not authenticated, skipping loadOrganizations');
          set({ organizations: [], activeOrganizationId: null, isLoading: false });
          return;
        }
        set({ isLoading: true });
        try {
          const session = await auth.getSession();
          const user = session.data.session?.user;
          if (!user) {
            set({ organizations: [], activeOrganizationId: null, isLoading: false });
            return;
          }

          let organizations = await getOrganizationsForUser(user.id);

          // Auto-create a default organization for new users
          if (organizations.length === 0) {
            console.log('[loadOrganizations] No organizations found, creating default organization...');
            try {
              const defaultOrg = await createOrganizationForUser(user.id, 'My Organization');
              organizations = [defaultOrg];
              console.log('[loadOrganizations] Default organization created:', defaultOrg.id);
            } catch (createError) {
              console.error('[loadOrganizations] Failed to create default organization:', createError);
              // Continue without organization - user can create one manually
            }
          }

          let activeOrganizationId = get().activeOrganizationId;

          if (!activeOrganizationId || !organizations.find((org) => org.id === activeOrganizationId)) {
            activeOrganizationId = organizations[0]?.id || null;
          }

          set({ organizations: organizations, activeOrganizationId: activeOrganizationId, isLoading: false });
          
          // Load stores for the active organization after organizations are loaded
          if (activeOrganizationId) {
            console.log('[organizationStore] Organizations loaded, loading stores for org:', activeOrganizationId);
            const { useStoreManagement } = await import('./storeManagement');
            useStoreManagement.getState().loadStores();
          }
        } catch (error) {
          console.error('Error loading organizations:', error);
          set({ isLoading: false });
        }
      },

      setActiveOrganization: (organizationId) => {
        const currentOrgId = get().activeOrganizationId;
        set({ activeOrganizationId: organizationId });
        // If actually switching, just update state; let UI react to org change
        if (currentOrgId && currentOrgId !== organizationId) {
          console.log('[organizationStore] Organization switched, updating state (no full page reload)');
        }
      },

      createOrganization: async (name) => {
        if (!name.trim()) {
          throw new Error('Organization name is required');
        }

        set({ isLoading: true });
        try {
          const session = await auth.getSession();
          const user = session.data.session?.user;
          if (!user) {
            throw new Error('User not authenticated');
          }

          const organization = await createOrganizationForUser(user.id, name.trim());
          const organizations = [...get().organizations, organization];

          set({
            organizations: organizations,
            activeOrganizationId: organization.id,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      loadMembers: async (organizationId) => {
        set({ isLoading: true });
        try {
          const members = await getOrganizationMembers(organizationId);
          set({ members: members, isLoading: false });
        } catch (error) {
          console.error('Error loading organization members:', error);
          set({ isLoading: false });
        }
      },

      addMemberByEmail: async (organizationId, email, role) => {
        set({ isLoading: true });
        try {
          await addOrganizationMemberByEmail(organizationId, email, role);
          const members = await getOrganizationMembers(organizationId);
          set({ members: members, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      updateMemberRole: async (organizationId, userId, role) => {
        set({ isLoading: true });
        try {
          await updateOrganizationMemberRole(organizationId, userId, role);
          const members = await getOrganizationMembers(organizationId);
          set({ members: members, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      removeMember: async (organizationId, userId) => {
        set({ isLoading: true });
        try {
          await removeOrganizationMember(organizationId, userId);
          const members = await getOrganizationMembers(organizationId);
          set({ members: members, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      deleteOrganization: async (organizationId) => {
        const session = await auth.getSession();
        const user = session.data.session?.user;
        if (!user) {
          throw new Error('User not authenticated');
        }

        set({ isLoading: true });
        try {
          await deleteOrganizationFromSupabase(user.id, organizationId);
          
          // Remove from local state
          const orgs = get().organizations.filter(org => org.id !== organizationId);
          const currentActiveId = get().activeOrganizationId;
          const newActiveId = currentActiveId === organizationId 
            ? (orgs[0]?.id || null) 
            : currentActiveId;
          
          set({ 
            organizations: orgs, 
            activeOrganizationId: newActiveId,
            members: currentActiveId === organizationId ? [] : get().members,
            isLoading: false 
          });

          // Clear stores if the deleted org was active
          if (newActiveId !== organizationId) {
            const { useStoreManagement } = await import('./storeManagement');
            useStoreManagement.getState().loadStores();
          } else {
            const { useStoreManagement } = await import('./storeManagement');
            useStoreManagement.getState().clearStores();
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      clearOrganizations: () => {
        set({ organizations: [], activeOrganizationId: null, members: [], isLoading: false });
      },
    }),
    {
      name: 'organization-state',
      partialize: (state) => ({
        organizations: state.organizations,
        activeOrganizationId: state.activeOrganizationId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);
