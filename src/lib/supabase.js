import { createClient } from "@supabase/supabase-js";

// Supabase configuration
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

// ==========================================
// SINGLETON PATTERN - ensure only one client
// ==========================================
let supabaseInstance = null;
let supabasePublicInstance = null;

function getSupabaseClient() {
  if (!supabaseInstance) {
    console.log("[Supabase] Creating singleton client instance");
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: "supabase.auth.token",
      },
      global: {
        headers: {
          "X-Client-Info": "supabase-js-web",
        },
      },
    });
  }
  return supabaseInstance;
}

function getSupabasePublicClient() {
  if (!supabasePublicInstance) {
    console.log("[Supabase] Creating singleton public client instance");
    supabasePublicInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabasePublicInstance;
}

// Export singleton clients
export const supabase = getSupabaseClient();
export const supabasePublic = getSupabasePublicClient();

// Export auth for convenience
export const auth = supabase.auth;

// ==========================================
// AUTH TIMEOUT CONSTANTS  (✅ FIXED)
// ==========================================
// 30 minutes is WAY too long for UI requests.
// Keep these short so tab-switch doesn't “hang” for ages.
export const AUTH_TIMEOUT_MS = 10_000; // 10s for auth operations
export const SESSION_CHECK_TIMEOUT_MS = 8_000; // 8s for session checks

// ==========================================
// TIMEOUT WRAPPER FOR PROMISES
// ==========================================
export class AuthTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`Auth operation '${operation}' timed out after ${timeoutMs}ms`);
    this.name = "AuthTimeoutError";
  }
}

/**
 * Wraps a promise with a timeout. If the timeout is reached, the promise rejects.
 */
export async function withTimeout(promise, timeoutMs, operationName) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AuthTimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ==========================================
// SESSION MANAGEMENT WITH TIMEOUTS
// ==========================================

/**
 * Gets the current session with a timeout.
 * If timeout occurs, returns null and logs warning.
 */
export async function getSessionWithTimeout(timeoutMs = AUTH_TIMEOUT_MS) {
  console.log("[getSessionWithTimeout] Starting session fetch...");
  try {
    const result = await withTimeout(
      auth.getSession(),
      timeoutMs,
      "getSession",
    );
    console.log(
      "[getSessionWithTimeout] Session fetch complete:",
      result.data.session ? "has session" : "no session",
    );
    return result.data.session;
  } catch (error) {
    if (error instanceof AuthTimeoutError) {
      console.error("[getSessionWithTimeout] TIMEOUT - session fetch hung");
      return null;
    }
    console.error("[getSessionWithTimeout] Error:", error);
    return null; // ✅ do not throw here; prevents UI cascade
  }
}

/**
 * Gets the current user with a timeout.
 * If timeout occurs, returns null.
 */
export async function getUserWithTimeout(timeoutMs = AUTH_TIMEOUT_MS) {
  console.log("[getUserWithTimeout] Starting user fetch...");
  try {
    const result = await withTimeout(auth.getUser(), timeoutMs, "getUser");
    console.log(
      "[getUserWithTimeout] User fetch complete:",
      result.data.user ? "has user" : "no user",
    );
    return result.data.user;
  } catch (error) {
    if (error instanceof AuthTimeoutError) {
      console.error("[getUserWithTimeout] TIMEOUT - user fetch hung");
      return null;
    }
    console.error("[getUserWithTimeout] Error:", error);
    return null; // ✅ do not throw here
  }
}

/**
 * Attempts to refresh the session silently.
 * Returns true if session was refreshed successfully, false otherwise.
 */
export async function refreshSessionSilently(timeoutMs = AUTH_TIMEOUT_MS) {
  console.log("[refreshSessionSilently] Attempting silent session refresh...");
  try {
    const { data, error } = await withTimeout(
      auth.refreshSession(),
      timeoutMs,
      "refreshSession",
    );

    if (error) {
      console.warn("[refreshSessionSilently] Refresh failed:", error);
      return false;
    }

    if (data.session) {
      console.log("[refreshSessionSilently] Session refreshed successfully");
      return true;
    }

    console.log("[refreshSessionSilently] No session after refresh");
    return false;
  } catch (e) {
    if (e instanceof AuthTimeoutError) {
      console.warn("[refreshSessionSilently] TIMEOUT during refresh");
      return false;
    }
    console.warn("[refreshSessionSilently] Error during refresh:", e);
    return false;
  }
}

/**
 * Clears stale session data from localStorage.
 * Use this when the session is definitely invalid.
 */
export function clearStaleSession() {
  console.log("[clearStaleSession] Clearing stale session data...");
  try {
    localStorage.removeItem("shopify-report-auth");
  } catch (e) {
    console.warn("[clearStaleSession] Could not clear localStorage:", e);
  }
}

// ==========================================
// ✅ FAST ensureValidSession (TTL + in-flight dedupe)
// ==========================================
// Prevents double session checks when queryProductsPage + queryProductStats run together.
let lastSessionCheckAt = 0;
let inFlightSessionPromise = null;

const SESSION_CHECK_TTL_MS = 30_000; // 30s: skip repeated session checks

/**
 * Ensures the Supabase session is valid before making authenticated requests.
 * - TTL: only checks at most once per SESSION_CHECK_TTL_MS
 * - Dedupes concurrent calls: shares one in-flight promise
 * - Only refreshes when near expiry or missing
 */
export async function ensureValidSession(
  timeoutMs = SESSION_CHECK_TIMEOUT_MS,
  force = false,
) {
  const now = Date.now();

  // ✅ Skip frequent checks
  if (!force && now - lastSessionCheckAt < SESSION_CHECK_TTL_MS) {
    return null; // caller doesn't need session object; just ensure auth is okay
  }

  // ✅ Deduplicate concurrent checks
  if (inFlightSessionPromise) {
    return inFlightSessionPromise;
  }

  inFlightSessionPromise = (async () => {
    console.log("[ensureValidSession] Checking session validity...");
    try {
      let session = await getSessionWithTimeout(timeoutMs);

      // If missing session, try a single refresh (fast)
      if (!session) {
        console.warn(
          "[ensureValidSession] No session from initial check. Attempting silent refresh...",
        );
        const refreshed = await refreshSessionSilently(
          Math.min(timeoutMs, AUTH_TIMEOUT_MS),
        );
        if (refreshed) {
          session = await getSessionWithTimeout(
            Math.min(timeoutMs, AUTH_TIMEOUT_MS),
          );
        }
      }

      // If we still don't have a session, stop here
      if (!session) {
        console.warn("[ensureValidSession] No valid session available");
        return null;
      }

      // Proactive refresh if expiring soon (only once)
      const expiresAt = session.expires_at;
      if (expiresAt) {
        const nowSec = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = expiresAt - nowSec;
        if (timeUntilExpiry < 60) {
          console.log(
            "[ensureValidSession] Token expiring soon, attempting refresh...",
          );
          const ok = await refreshSessionSilently(
            Math.min(timeoutMs, AUTH_TIMEOUT_MS),
          );
          if (ok) {
            session = await getSessionWithTimeout(
              Math.min(timeoutMs, AUTH_TIMEOUT_MS),
            );
          }
        }
      }

      lastSessionCheckAt = Date.now();
      console.log("[ensureValidSession] Session ok (cached for TTL)");
      return session;
    } catch (e) {
      console.error("[ensureValidSession] Unexpected error:", e);
      return null;
    } finally {
      inFlightSessionPromise = null;
    }
  })();

  return inFlightSessionPromise;
}

// ==========================================
// INITIALIZATION HELPER WITH TIMEOUT
// ==========================================
export async function initializeAuthWithTimeout(timeoutMs = AUTH_TIMEOUT_MS) {
  console.log(
    "[initializeAuthWithTimeout] Starting auth initialization with timeout:",
    timeoutMs,
    "ms",
  );
  let session = null;
  let timedOut = false;
  try {
    session = await withTimeout(
      (async () => {
        console.log("[initializeAuthWithTimeout] Calling auth.getSession()...");
        const { data, error } = await auth.getSession();
        if (error) {
          console.warn("[initializeAuthWithTimeout] Session error:", error);
          throw error;
        }
        console.log(
          "[initializeAuthWithTimeout] Got session result:",
          data.session ? "exists" : "none",
        );
        return data.session;
      })(),
      timeoutMs,
      "initializeAuth",
    );
    console.log(
      "[initializeAuthWithTimeout] Complete:",
      session ? "has session" : "no session",
    );
    return { session, timedOut: false };
  } catch (error) {
    if (error instanceof AuthTimeoutError) {
      timedOut = true;
      console.error(
        "[initializeAuthWithTimeout] TIMEOUT - auth initialization hung",
      );
      return { session, timedOut, error };
    }
    console.error("[initializeAuthWithTimeout] Error:", error);
    return { session, timedOut, error };
  }
}

// ==========================================
// SUPABASE CALL WRAPPER WITH LOGGING
// ==========================================
export async function loggedSupabaseCall(operationName, queryFn, timeoutMs) {
  console.log(`[Supabase:${operationName}] Starting...`);
  const startTime = Date.now();

  try {
    let result;
    if (timeoutMs) {
      result = await withTimeout(queryFn(), timeoutMs, operationName);
    } else {
      result = await queryFn();
    }

    const duration = Date.now() - startTime;
    console.log(`[Supabase:${operationName}] Complete in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    if (error instanceof AuthTimeoutError) {
      console.error(`[Supabase:${operationName}] TIMEOUT after ${duration}ms`);
    } else {
      console.error(
        `[Supabase:${operationName}] ERROR after ${duration}ms:`,
        error,
      );
    }
    throw error;
  }
}
