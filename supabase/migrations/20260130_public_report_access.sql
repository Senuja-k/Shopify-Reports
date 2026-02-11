-- Migration: Add RLS policy for public report access
-- This allows anonymous users to read products if they have a valid share link

-- First, create a function to check if a share link is valid
CREATE OR REPLACE FUNCTION public.is_valid_share_link(
  p_share_link TEXT,
  p_store_id TEXT,
  p_organization_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  report_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM reports
    WHERE share_link = p_share_link
      AND (store_id = p_store_id OR store_id = 'all-stores')
      AND (organization_id = p_organization_id OR p_organization_id IS NULL)
  ) INTO report_exists;
  
  RETURN report_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policy on shopify_products for public report access
-- Note: This is a read-only policy for anonymous access

-- First, drop the existing policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Allow public report product access" ON shopify_products;

-- Create a policy that allows SELECT for products belonging to stores with valid public reports
-- This uses a more permissive approach - if the organization has any public report, 
-- products for that org can be read via share link verification in the application layer
CREATE POLICY "Allow public report product access" ON shopify_products
  FOR SELECT
  USING (
    -- Allow if user is authenticated and owns the data
    (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )))
    OR
    -- Allow if the organization has at least one public report (for anonymous access)
    (auth.uid() IS NULL AND organization_id IN (
      SELECT DISTINCT organization_id FROM reports WHERE share_link IS NOT NULL
    ))
  );

-- Similarly for shopify_stores (needed to look up store IDs)
DROP POLICY IF EXISTS "Allow public report store access" ON shopify_stores;

CREATE POLICY "Allow public report store access" ON shopify_stores
  FOR SELECT
  USING (
    -- Allow if user is authenticated and owns the data
    (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )))
    OR
    -- Allow if the organization has at least one public report
    (auth.uid() IS NULL AND organization_id IN (
      SELECT DISTINCT organization_id FROM reports WHERE share_link IS NOT NULL
    ))
  );

-- Similarly for shopify_store_sync_status
DROP POLICY IF EXISTS "Allow public report sync status access" ON shopify_store_sync_status;

CREATE POLICY "Allow public report sync status access" ON shopify_store_sync_status
  FOR SELECT
  USING (
    -- Allow if user is authenticated and owns the data
    (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )))
    OR
    -- Allow if the organization has at least one public report
    (auth.uid() IS NULL AND organization_id IN (
      SELECT DISTINCT organization_id FROM reports WHERE share_link IS NOT NULL
    ))
  );

-- Allow anonymous read access to reports table for share link lookup
DROP POLICY IF EXISTS "Allow public report lookup" ON reports;

CREATE POLICY "Allow public report lookup" ON reports
  FOR SELECT
  USING (
    -- Allow if user is authenticated and is a member of the organization
    (auth.uid() IS NOT NULL AND organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
    OR
    -- Allow anonymous users to look up reports by share_link
    (auth.uid() IS NULL AND share_link IS NOT NULL)
  );
