import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

// ==========================================
// SINGLETON PATTERN - ensure only one client
// ==========================================
let supabaseInstance = null;
let supabasePublicInstance = null;

function getSupabaseClient() {
  if (!supabaseInstance) {
    console.log('[Supabase] Creating singleton client instance');
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: 'supabase.auth.token',
      },
      global: {
        headers: {
          'X-Client-Info': 'supabase-js-web',
        },
      },
    });
  }
  return supabaseInstance;
}

function getSupabasePublicClient() {
  if (!supabasePublicInstance) {
    console.log('[Supabase] Creating singleton public client instance');
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
// AUTH TIMEOUT CONSTANTS
// ==========================================
// Increased to 30 minutes (user requested longer validation window).
// Note: Longer timeouts mean the app may take longer to detect an invalid
// session. Only increase this if you understand the security tradeoffs.
export const AUTH_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes for auth operations
export const SESSION_CHECK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes for session checks

// ==========================================
// TIMEOUT WRAPPER FOR PROMISES
// ==========================================
export class AuthTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`Auth operation '${operation}' timed out after ${timeoutMs}ms`);
    this.name = 'AuthTimeoutError';
  }
}

/**
 * Wraps a promise with a timeout. If the timeout is reached, the promise rejects.
 */
export async function withTimeout(
  promise,
  timeoutMs,
  operationName
) {
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
  console.log('[getSessionWithTimeout] Starting session fetch...');
  try {
    const result = await withTimeout(
      auth.getSession(),
      timeoutMs,
      'getSession'
    );
    console.log('[getSessionWithTimeout] Session fetch complete:', result.data.session ? 'has session' : 'no session');
    return result.data.session;
  } catch (error) {
    if (error instanceof AuthTimeoutError) {
      console.error('[getSessionWithTimeout] TIMEOUT - session fetch hung');
      return null;
    }
    console.error('[getSessionWithTimeout] Error:', error);
    throw error;
  }
}

/**
 * Gets the current user with a timeout.
 * If timeout occurs, returns null.
 */
export async function getUserWithTimeout(timeoutMs = AUTH_TIMEOUT_MS) {
  console.log('[getUserWithTimeout] Starting user fetch...');
  try {
    const result = await withTimeout(
      auth.getUser(),
      timeoutMs,
      'getUser'
    );
    console.log('[getUserWithTimeout] User fetch complete:', result.data.user ? 'has user' : 'no user');
    return result.data.user;
  } catch (error) {
    if (error instanceof AuthTimeoutError) {
      console.error('[getUserWithTimeout] TIMEOUT - user fetch hung');
      return null;
    }
    console.error('[getUserWithTimeout] Error:', error);
    throw error;
  }
}

/**
 * Attempts to refresh the session silently.
 * Does NOT redirect - just clears stale data and tries to get a fresh session.
 * Returns true if session was refreshed successfully, false otherwise.
 */
export async function refreshSessionSilently() {
  console.log('[refreshSessionSilently] Attempting silent session refresh...');
  
  try {
    // Try to refresh the session
    const { data, error } = await withTimeout(
      auth.refreshSession(),
      AUTH_TIMEOUT_MS,
      'refreshSession'
    );
    
    if (error) {
      console.warn('[refreshSessionSilently] Refresh failed:', error);
      return false;
    }
    
    if (data.session) {
      console.log('[refreshSessionSilently] Session refreshed successfully');
      return true;
    }
    
    console.log('[refreshSessionSilently] No session after refresh');
    return false;
  } catch (e) {
    console.warn('[refreshSessionSilently] Error during refresh:', e);
    return false;
  }
}

/**
 * Clears stale session data from localStorage.
 * Use this when the session is definitely invalid.
 */
export function clearStaleSession() {
  console.log('[clearStaleSession] Clearing stale session data...');
  try {
    localStorage.removeItem('shopify-report-auth');
  } catch (e) {
    console.warn('[clearStaleSession] Could not clear localStorage:', e);
  }
}

/**
 * Ensures the Supabase session is valid before making authenticated requests.
 * This handles cases where the session might have expired while the tab was inactive.
 * 
 * @param timeoutMs - Maximum time to wait for session check (default 5000ms)
 * @returns The current session if valid, or null if no valid session exists
 */
export async function ensureValidSession(timeoutMs = SESSION_CHECK_TIMEOUT_MS) {
  console.log('[ensureValidSession] Checking session validity...');

  try {
    // Try a simple session fetch with timeout helper (handles its own timeout)
    let session = await getSessionWithTimeout(timeoutMs);

    if (!session) {
      console.warn('[ensureValidSession] No session from initial check. Attempting silent refresh...');
      // If initial session check failed or timed out, try a silent refresh
      const refreshed = await refreshSessionSilently();
      if (refreshed) {
        console.log('[ensureValidSession] Silent refresh succeeded, re-reading session');
        session = await getSessionWithTimeout(AUTH_TIMEOUT_MS);
      } else {
        console.warn('[ensureValidSession] Silent refresh did not produce a session');
      }
    }

    if (!session) {
      console.warn('[ensureValidSession] No valid session available after retries');
      return null;
    }

    // Check expiry and refresh proactively if it's about to expire
    const expiresAt = session.expires_at;
    if (expiresAt) {
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = expiresAt - now;
      if (timeUntilExpiry < 60) {
        console.log('[ensureValidSession] Token expiring soon, attempting refresh...');
        const ok = await refreshSessionSilently();
        if (!ok) {
          console.warn('[ensureValidSession] Refresh attempt failed, clearing session');
          return null;
        }
        // Re-read session after refresh
        session = await getSessionWithTimeout(AUTH_TIMEOUT_MS);
        if (!session) {
          console.warn('[ensureValidSession] Session not available after refresh');
          return null;
        }
      }
    }

    console.log('[ensureValidSession] Session is valid');
    return session;
  } catch (error) {
    // on timeout or any error, return null to allow graceful handling by callers
    console.error('[ensureValidSession] Unexpected error:', error);
    return null;
  }
}

// ==========================================
// INITIALIZATION HELPER WITH TIMEOUT
// ==========================================

/**
 * Initializes auth with proper timeout handling.
 * Returns session if successful, null if timeout or error.
 * Does NOT automatically redirect - caller decides what to do.
 */
export async function initializeAuthWithTimeout(timeoutMs = AUTH_TIMEOUT_MS) {
  console.log('[initializeAuthWithTimeout] Starting auth initialization with timeout:', timeoutMs, 'ms');
  let session = null;
  let timedOut = false;
  try {
    session = await withTimeout(
      (async () => {
        console.log('[initializeAuthWithTimeout] Calling auth.getSession()...');
        const { data, error } = await auth.getSession();
        if (error) {
          console.warn('[initializeAuthWithTimeout] Session error:', error);
          throw error;
        }
        console.log('[initializeAuthWithTimeout] Got session result:', data.session ? 'exists' : 'none');
        return data.session;
      })(),
      timeoutMs,
      'initializeAuth'
    );
    console.log('[initializeAuthWithTimeout] Complete:', session ? 'has session' : 'no session');
    return { session, timedOut: false };
  } catch (error) {
    if (error instanceof AuthTimeoutError) {
      timedOut = true;
      console.error('[initializeAuthWithTimeout] TIMEOUT - auth initialization hung');
      return { session, timedOut, error };
    }
    console.error('[initializeAuthWithTimeout] Error:', error);
    return { session, timedOut, error };
  }
}

// ==========================================
// SUPABASE CALL WRAPPER WITH LOGGING
// ==========================================

/**
 * Wraps a Supabase query with logging and optional timeout.
 * Logs before and after the call to help debug hangs.
 */
export async function loggedSupabaseCall(
  operationName,
  queryFn,
  timeoutMs
) {
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
      console.error(`[Supabase:${operationName}] ERROR after ${duration}ms:`, error);
    }
    throw error;
  }
}

