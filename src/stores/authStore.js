export * from './authStore.jsx';
/*
import { persist } from 'zustand/middleware';
import { auth, supabase, initializeAuthWithTimeout, refreshSessionSilently, withTimeout } from '@/lib/supabase';
import { getShopifyAuthUrl } from '@/lib/shopify-oauth';
import { useOrganization } from '@/stores/organizationStore';

const EMAIL_VERIFICATION_ENABLED = false; // Email verification disabled
let authSubscription = null;
let consecutiveTimeouts = 0; // Track consecutive timeouts
let isRefreshing = false; // Prevent multiple simultaneous refreshes

export const useAuth = create()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      
      initializeAuth: async () => {
        console.log('[authStore] initializeAuth started');
        set({ isLoading: true });
        try {
          // Get current session with timeout (increased to 15s for slow networks)
          console.log('[authStore] Getting session with timeout...');
          const { session, timedOut, error } = await initializeAuthWithTimeout(15000);
          
          if (timedOut) {
            consecutiveTimeouts++;
            console.warn(`[authStore] Session fetch timed out (consecutive: ${consecutiveTimeouts})`);
            
            // On timeout, just mark authenticated
            // User will be redirected to login if needed
            // Don't try to refresh on timeout can compound the problem
            set({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }
          
          // Reset timeout counter on success
          consecutiveTimeouts = 0;
          
          if (error) {
            console.error('[authStore] Error getting session:', error);
            set({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }
          
          console.log('[authStore] Got session:', session ? 'exists' : 'none');
          
          if (session?.user) {
            // Ensure profile exists (fallback if trigger doesn't fire)
            try {
              console.log('[authStore] Upserting profile...');
              await supabase
                .from('profiles')
                .upsert({ id: session.user.id, email: session.user.email }, { onConflict: 'id' });
              console.log('[authStore] Profile upsert complete');
            } catch (profileError) {
              console.warn('[authStore] Could not create profile (may already exist or timed out):', profileError);
            }

            const user = {
              id: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            };
            set({ user, isAuthenticated: true, isLoading: false });
            console.log('[authStore] Login complete, user set. isAuthenticated:', true, 'user:', user);
            useOrganization.getState().loadOrganizations();
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false });
            useOrganization.getState().clearOrganizations();
          }

          // Listen for auth state changes (ensure single subscription)
          if (authSubscription) {
            console.log('[authStore] Cleaning up existing auth subscription');
            authSubscription.unsubscribe();
            authSubscription = null;
          }

          console.log('[authStore] Setting up auth state listener');
          const { data: subscriptionData } = auth.onAuthStateChange(async (event, session) => {
            console.log('[authStore] Auth state changed:', event);
            
            // Skip INITIAL_SESSION since we already handled it above
            if (event === 'INITIAL_SESSION') {
              console.log('[authStore] Skipping INITIAL_SESSION (already handled)');
              return;
            }
            
            if (session?.user) {
              // Ensure profile exists (fallback if trigger doesn't fire)
              try {
                await supabase
                  .from('profiles')
                  .upsert({ id: session.user.id, email: session.user.email }, { onConflict: 'id' });
              } catch (profileError) {
                console.warn('Could not create profile (may already exist):', profileError);
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
          // Ignore abort errors - they happen during component re-renders
          const errorMessage = (error)?.message || String(error);
          if (errorMessage.includes('AbortError') || errorMessage.includes('signal is aborted')) {
            console.log('Auth initialization aborted (likely due to re-render)');
            return;
          }
          console.error('[authStore] Error initializing auth:', error);
          set({ isLoading: false });
        }
      },

      login: async (email, password) => {
        console.log('[authStore] login started for:', email);
        if (!email || !password) {
          throw new Error('Email and password are required');
        }
        if (!email.includes('@')) {
          throw new Error('Invalid email format');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }

        set({ isLoading: true });
        try {
          console.log('[authStore] Calling signInWithPassword...');
          const { data, error } = await auth.signInWithPassword({
            email,
            password,
          });
          console.log('[authStore] signInWithPassword complete');

          if (error) {
            // Handle specific Supabase auth errors
            console.error('[authStore] Supabase auth error:', error.message);
            if (error.message.includes('Invalid login credentials')) {
              throw new Error('Invalid email or password');
            } else if (error.message.includes('Email not confirmed')) {
              throw new Error('Please confirm your email address');
            } else if (error.message.includes('User not found')) {
              throw new Error('No account found with this email');
            } else {
              throw new Error(error.message);
            }
          }

          if (data.user) {
            console.log('[authStore] User logged in:', data.user.id);
            // Ensure profile exists (fallback if trigger doesn't fire) - don't await, do in background
            (async () => {
              try {
                await supabase
                  .from('profiles')
                  .upsert({ id: data.user.id, email: data.user.email }, { onConflict: 'id' });
                console.log('[authStore] Profile upserted');
              } catch (profileError) {
                console.warn('[authStore] Could not create profile:', profileError);
              }
            })();

            const user = {
              id: data.user.id,
              email: data.user.email || '',
              name: data.user.user_metadata?.name || email.split('@')[0],
            };
            set({ user, isAuthenticated: true, isLoading: false });
            console.log('[authStore] Login complete, user set');
          }
        } catch (error) {
          console.error('[authStore] Login error:', error);
          set({ isLoading: false });
          
          // Re-throw with proper error message
          if (error.message) {
            throw error;
          }
          throw new Error('Login failed. Please try again.');
        }
      },

      signup: async (email, password) => {
        console.log('[authStore] signup started for:', email);
        if (!email || !password) {
          throw new Error('Email and password are required');
        }
        if (!email.includes('@')) {
          throw new Error('Invalid email format');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }

        set({ isLoading: true });
        try {
          console.log('[authStore] Calling auth.signUp...');
          const { data, error } = await auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/`,
            },
          });
          
          console.log('[authStore] signUp complete, user:', data?.user?.id, 'session:', !!data?.session);

          if (error) {
            console.error('[authStore] Supabase signup error:', error.message);
            if (error.message.includes('User already registered')) {
              throw new Error('An account with this email already exists');
            } else if (error.message.includes('Password should be at least')) {
              throw new Error(error.message);
            } else {
              throw new Error(error.message);
            }
          }

          if (data.user) {
            console.log('[authStore] User created, creating profile in background...');
            // Create profile in background (don't await)
            (async () => {
              try {
                await supabase
                  .from('profiles')
                  .upsert({ id: data.user.id, email: data.user.email }, { onConflict: 'id' });
                console.log('[authStore] Profile created');
              } catch (profileError) {
                console.warn('[authStore] Could not create profile:', profileError);
              }
            })();

            // If email confirmation is disabled in Supabase, user is immediately confirmed
            if (data.session) {
              console.log('[authStore] Session exists - user is authenticated immediately');
              const user = {
                id: data.user.id,
                email: data.user.email || '',
                name: email.split('@')[0],
              };
              set({ user, isAuthenticated: true, isLoading: false });
            } else {
              console.log('[authStore] No session - email confirmation required');
              // Email confirmation required - user will receive email from Supabase
              set({ isLoading: false });
            }
          } else {
            console.log('[authStore] No user returned from signUp');
            set({ isLoading: false });
          }
        } catch (error) {
          console.error('[authStore] Signup error:', error);
          set({ isLoading: false });
          
          // Re-throw with proper error message
          if (error.message) {
            throw error;
          }
          throw new Error('Signup failed. Please try again.');
        }
      },

      verifyEmail: async (_email, _token) => {
        // Email verification is disabled
        throw new Error('Email verification is currently disabled');
      },

      logout: async () => {
        console.log('[authStore] Logout started');
        set({ isLoading: true });
        try {
          // Cleanup auth listener to prevent stacking
          if (authSubscription) {
            console.log('[authStore] Unsubscribing auth listener');
            authSubscription.unsubscribe();
            authSubscription = null;
          }
          
          const { error } = await auth.signOut();
          if (error) throw error;
          
          console.log('[authStore] Auth signout successful, clearing state');
          set({ user: null, isAuthenticated: false, isLoading: false });
          useOrganization.getState().clearOrganizations();
          
          // Clear stores from storeManagement
          const { useStoreManagement } = await import('./storeManagement');
          useStoreManagement.getState().clearStores();

          // Clear persisted Zustand state
          clearZustandPersistedState();

          console.log('[authStore] Logout complete, redirecting with refresh...');
          // Use replace to redirect to login and refresh
          window.location.href = '/login';
        } catch (error) {
          console.error('[authStore] Error logging out:', error);
          set({ isLoading: false });
          throw error;
        }
      },
// ...existing code...
}); // End of useAuth store definition

// Helper to clear persisted Zustand state for all stores
export function clearZustandPersistedState() {
  try {
    localStorage.removeItem('products-store');
    localStorage.removeItem('shopify-stores');
    localStorage.removeItem('organization-state');
  } catch (e) {
    console.warn('[authStore] Could not clear Zustand persisted state:', e);
  }
}

      setUser: (user) => {
        set({ user, isAuthenticated: true });
      },

      initiateShopifyLogin: (shop) => {
        try {
          // Remove .myshopify.com if user enters it
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
    }
  );
*/
