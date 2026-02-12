import { create } from "zustand";
import { persist } from "zustand/middleware";
import { auth, supabase, initializeAuthWithTimeout } from "@/lib/supabase";
import { getShopifyAuthUrl } from "@/lib/shopify-oauth";
import { useOrganization } from "@/stores/organizationStore";

const EMAIL_VERIFICATION_ENABLED = false;
let authSubscription = null;
let consecutiveTimeouts = 0;

export const useAuth = create()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      initializeAuth: async () => {
        console.log("[authStore] initializeAuth started");
        set({ isLoading: true });

        try {
          const { session, timedOut, error } =
            await initializeAuthWithTimeout(15000);

          if (timedOut) {
            consecutiveTimeouts++;
            console.warn(
              `[authStore] Session fetch timed out (consecutive: ${consecutiveTimeouts})`,
            );
            set({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }

          consecutiveTimeouts = 0;

          if (error) {
            console.error("[authStore] Error getting session:", error);
            set({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }

          console.log("[authStore] Got session:", session ? "exists" : "none");

          if (session?.user) {
            try {
              await supabase
                .from("profiles")
                .upsert(
                  { id: session.user.id, email: session.user.email },
                  { onConflict: "id" },
                );
            } catch (profileError) {
              console.warn(
                "[authStore] Could not create profile:",
                profileError,
              );
            }

            const user = {
              id: session.user.id,
              email: session.user.email || "",
              name:
                session.user.user_metadata?.name ||
                session.user.email?.split("@")[0] ||
                "User",
            };

            set({ user, isAuthenticated: true, isLoading: false });

            // ✅ CHANGE
            useOrganization.getState().loadOrganizations({ force: true });
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false });
            useOrganization.getState().clearOrganizations();
          }

          if (authSubscription) {
            authSubscription.unsubscribe();
            authSubscription = null;
          }

          const { data: subscriptionData } = auth.onAuthStateChange(
            async (event, session) => {
              console.log("[authStore] Auth state changed:", event);

              if (event === "INITIAL_SESSION") return;

              if (session?.user) {
                try {
                  await supabase
                    .from("profiles")
                    .upsert(
                      { id: session.user.id, email: session.user.email },
                      { onConflict: "id" },
                    );
                } catch (profileError) {
                  console.warn(
                    "[authStore] Could not create profile:",
                    profileError,
                  );
                }

                const user = {
                  id: session.user.id,
                  email: session.user.email || "",
                  name:
                    session.user.user_metadata?.name ||
                    session.user.email?.split("@")[0] ||
                    "User",
                };

                set({ user, isAuthenticated: true });

                // ✅ CHANGE
                useOrganization.getState().loadOrganizations({ force: true });
              } else {
                set({ user: null, isAuthenticated: false });
                useOrganization.getState().clearOrganizations();
              }
            },
          );

          authSubscription = subscriptionData?.subscription || null;
        } catch (error) {
          const errorMessage = error?.message || String(error);
          if (
            errorMessage.includes("AbortError") ||
            errorMessage.includes("signal is aborted")
          )
            return;
          console.error("[authStore] Error initializing auth:", error);
          set({ isLoading: false });
        }
      },

      login: async (email, password) => {
        if (!email || !password)
          throw new Error("Email and password are required");
        if (!email.includes("@")) throw new Error("Invalid email format");
        if (password.length < 6)
          throw new Error("Password must be at least 6 characters");

        set({ isLoading: true });
        try {
          const { data, error } = await auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            if (error.message.includes("Invalid login credentials"))
              throw new Error("Invalid email or password");
            if (error.message.includes("Email not confirmed"))
              throw new Error("Please confirm your email address");
            if (error.message.includes("User not found"))
              throw new Error("No account found with this email");
            throw new Error(error.message);
          }

          if (data.user) {
            (async () => {
              try {
                await supabase
                  .from("profiles")
                  .upsert(
                    { id: data.user.id, email: data.user.email },
                    { onConflict: "id" },
                  );
              } catch {}
            })();

            const user = {
              id: data.user.id,
              email: data.user.email || "",
              name: data.user.user_metadata?.name || email.split("@")[0],
            };

            set({ user, isAuthenticated: true, isLoading: false });

            // ✅ optional but helpful
            useOrganization.getState().loadOrganizations({ force: true });
          }
        } catch (error) {
          set({ isLoading: false });
          throw error?.message
            ? error
            : new Error("Login failed. Please try again.");
        }
      },

      signup: async (email, password) => {
        if (!email || !password)
          throw new Error("Email and password are required");
        if (!email.includes("@")) throw new Error("Invalid email format");
        if (password.length < 6)
          throw new Error("Password must be at least 6 characters");

        set({ isLoading: true });
        try {
          const { data, error } = await auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/` },
          });

          if (error) {
            if (error.message.includes("User already registered"))
              throw new Error("An account with this email already exists");
            throw new Error(error.message);
          }

          if (data.user) {
            (async () => {
              try {
                await supabase
                  .from("profiles")
                  .upsert(
                    { id: data.user.id, email: data.user.email },
                    { onConflict: "id" },
                  );
              } catch {}
            })();

            if (data.session) {
              const user = {
                id: data.user.id,
                email: data.user.email || "",
                name: email.split("@")[0],
              };
              set({ user, isAuthenticated: true, isLoading: false });

              // ✅ optional
              useOrganization.getState().loadOrganizations({ force: true });
            } else {
              set({ isLoading: false });
            }
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          set({ isLoading: false });
          throw error?.message
            ? error
            : new Error("Signup failed. Please try again.");
        }
      },

      verifyEmail: async (_email, _token) => {
        throw new Error("Email verification is currently disabled");
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

          const { useStoreManagement } = await import("./storeManagement");
          useStoreManagement.getState().clearStores();

          clearZustandPersistedState();
          window.location.href = "/login";
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      setUser: (user) => {
        set({ user, isAuthenticated: true });
      },

      initiateShopifyLogin: (shop) => {
        const cleanShop = shop.replace(".myshopify.com", "").toLowerCase();
        const authUrl = getShopifyAuthUrl(`${cleanShop}.myshopify.com`);
        window.location.href = authUrl;
      },
    }),
    {
      name: "auth-store",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

export function clearZustandPersistedState() {
  try {
    localStorage.removeItem("products-store");
    localStorage.removeItem("shopify-stores");
    localStorage.removeItem("organization-state");
  } catch (e) {
    console.warn("[authStore] Could not clear Zustand persisted state:", e);
  }
}
