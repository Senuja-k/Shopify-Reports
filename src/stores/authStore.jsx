import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { auth, supabase, initializeAuthWithTimeout, isAbortError } from '@/lib/supabase';
import { getShopifyAuthUrl } from '@/lib/shopify-oauth';
import { useOrganization } from '@/stores/organizationStore';

const EMAIL_VERIFICATION_ENABLED = false; // Email verification disabled
let authSubscription = null;
let consecutiveTimeouts = 0;
let inFlightAuthInit = null;

export const useAuth = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,

      initializeAuth: async () => {
        if (inFlightAuthInit) return inFlightAuthInit;

        inFlightAuthInit = (async () => {
          set({ isLoading: true });
          try {
            const { session, timedOut, error } = await initializeAuthWithTimeout(15000);
            if (timedOut) {
              consecutiveTimeouts++;
              console.warn(`[authStore] Session fetch timed out (consecutive: ${consecutiveTimeouts})`);
              set({ user: null, isAuthenticated: false, isLoading: false });
              return;
            }

            consecutiveTimeouts = 0;

            if (error) {
              if (isAbortError(error)) {
                console.debug('[authStore] Session fetch aborted (transient):', error?.message || error);
                set({ isLoading: false });
                return;
              }
              console.error('[authStore] Error getting session:', error);
              set({ user: null, isAuthenticated: false, isLoading: false });
              return;
            }

            if (session?.user) {
              try {
                await supabase.from('profiles').upsert({ id: session.user.id, email: session.user.email }, { onConflict: 'id' });
              } catch (profileError) {
                console.warn('[authStore] Could not create profile (may already exist or timed out):', profileError);
              }

              const user = {
                id: session.user.id,
                email: session.user.email || '',
                name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
              };
              set({ user, isAuthenticated: true, isLoading: false });
              useOrganization.getState().loadOrganizations();
            } else {
              set({ user: null, isAuthenticated: false, isLoading: false });
              useOrganization.getState().clearOrganizations();
            }

            if (authSubscription) {
              authSubscription.unsubscribe();
              authSubscription = null;
            }

            const { data: subscriptionData } = auth.onAuthStateChange(async (event, session) => {
              if (event === 'INITIAL_SESSION') return;
              if (session?.user) {
                try {
                  await supabase.from('profiles').upsert({ id: session.user.id, email: session.user.email }, { onConflict: 'id' });
                } catch (profileError) {
                  console.warn('[authStore] Could not create profile (may already exist):', profileError);
                }

                const user = {
                  id: session.user.id,
                  email: session.user.email || '',
                  name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
                };
                set({ user, isAuthenticated: true });
                useOrganization.getState().loadOrganizations();
              } else {
                set({ user: null, isAuthenticated: false });
                useOrganization.getState().clearOrganizations();
              }
            });

            authSubscription = subscriptionData?.subscription || null;
          } catch (error) {
            if (isAbortError(error)) {
              console.debug('[authStore] Auth initialization aborted (transient):', error?.message || error);
              set({ isLoading: false });
              return;
            }
            console.error('[authStore] Error initializing auth:', error);
            set({ isLoading: false });
          } finally {
            // Mark that initialization attempt completed (so UI can stop waiting)
            try {
              set({ isLoading: false, isInitialized: true });
            } catch (e) {
              // ignore set errors during teardown
            }
            inFlightAuthInit = null;
          }
        })();

        return inFlightAuthInit;
      },

      login: async (email, password) => {
        if (!email || !password) throw new Error('Email and password are required');
        if (!email.includes('@')) throw new Error('Invalid email format');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');

        set({ isLoading: true });
        try {
          const { data, error } = await auth.signInWithPassword({ email, password });
          if (error) {
            console.error('[authStore] Supabase auth error:', error.message);
            if (error.message.includes('Invalid login credentials')) throw new Error('Invalid email or password');
            if (error.message.includes('Email not confirmed')) throw new Error('Please confirm your email address');
            if (error.message.includes('User not found')) throw new Error('No account found with this email');
            throw new Error(error.message);
          }

          if (data.user) {
            (async () => {
              try {
                await supabase.from('profiles').upsert({ id: data.user.id, email: data.user.email }, { onConflict: 'id' });
              } catch (profileError) {
                console.warn('[authStore] Could not create profile:', profileError);
              }
            })();

            const user = { id: data.user.id, email: data.user.email || '', name: data.user.user_metadata?.name || email.split('@')[0] };
            set({ user, isAuthenticated: true, isLoading: false });
          }
        } catch (error) {
          console.error('[authStore] Login error:', error);
          set({ isLoading: false });
          if (error?.message) throw error;
          throw new Error('Login failed. Please try again.');
        }
      },

      signup: async (email, password) => {
        if (!email || !password) throw new Error('Email and password are required');
        if (!email.includes('@')) throw new Error('Invalid email format');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');

        set({ isLoading: true });
        try {
          const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/` } });
          if (error) {
            console.error('[authStore] Supabase signup error:', error.message);
            if (error.message.includes('User already registered')) throw new Error('An account with this email already exists');
            if (error.message.includes('Password should be at least')) throw new Error(error.message);
            throw new Error(error.message);
          }

          if (data.user) {
            (async () => {
              try {
                await supabase.from('profiles').upsert({ id: data.user.id, email: data.user.email }, { onConflict: 'id' });
              } catch (profileError) {
                console.warn('[authStore] Could not create profile:', profileError);
              }
            })();

            if (data.session) {
              const user = { id: data.user.id, email: data.user.email || '', name: email.split('@')[0] };
              set({ user, isAuthenticated: true, isLoading: false });
            } else {
              set({ isLoading: false });
            }
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          console.error('[authStore] Signup error:', error);
          set({ isLoading: false });
          if (error?.message) throw error;
          throw new Error('Signup failed. Please try again.');
        }
      },

      verifyEmail: async () => {
        throw new Error('Email verification is currently disabled');
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          if (authSubscription) {
            authSubscription.unsubscribe();
            authSubscription = null;
          }

          const { error } = await auth.signOut();
          if (error) throw error;

          set({ user: null, isAuthenticated: false, isLoading: false });
          useOrganization.getState().clearOrganizations();

          const { useStoreManagement } = await import('./storeManagement');
          useStoreManagement.getState().clearStores();

          try {
            localStorage.removeItem('products-store');
            localStorage.removeItem('shopify-stores');
            localStorage.removeItem('organization-state');
          } catch (e) {
            console.warn('[authStore] Could not clear Zustand persisted state:', e);
          }

          window.location.href = '/login';
        } catch (error) {
          console.error('[authStore] Error logging out:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      setUser: (user) => {
        set({ user, isAuthenticated: true });
      },

      initiateShopifyLogin: (shop) => {
        try {
          const cleanShop = shop.replace('.myshopify.com', '').toLowerCase();
          const authUrl = getShopifyAuthUrl(`${cleanShop}.myshopify.com`);
          window.location.href = authUrl;
        } catch (error) {
          console.error('Error initiating Shopify login:', error);
          throw error;
        }
      },
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);




