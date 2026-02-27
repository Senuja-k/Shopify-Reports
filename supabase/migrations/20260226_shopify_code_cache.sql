-- Cache table for Shopify OAuth code exchanges.
-- Prevents "code already used" errors when the client retries or
-- the exchange request is duplicated (React remount, infra retry, etc.).
-- Entries are short-lived; a cron or manual cleanup can purge rows older than 10 minutes.

CREATE TABLE IF NOT EXISTS public.shopify_code_cache (
  code_hash  TEXT        PRIMARY KEY,
  shop       TEXT        NOT NULL,
  access_token TEXT      NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow the service-role key used by the edge function full access.
-- No RLS needed — only the edge function (service role) touches this table.
ALTER TABLE public.shopify_code_cache ENABLE ROW LEVEL SECURITY;

-- Service-role key bypasses RLS, so no explicit policies are required.
-- Optional: auto-delete stale rows (Supabase pg_cron or manual).
COMMENT ON TABLE public.shopify_code_cache IS
  'Short-lived cache of Shopify OAuth code→token exchanges for idempotency.';
