-- Create the stores table that the application code expects
-- This is separate from shopify_stores which stores OAuth credentials

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  storefront_token TEXT,
  admin_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, domain)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_stores_user_id ON stores(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_organization_id ON stores(organization_id);
CREATE INDEX IF NOT EXISTS idx_stores_domain ON stores(domain);

-- Enable RLS
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Users can view stores in their organizations" ON stores;
CREATE POLICY "Users can view stores in their organizations"
  ON stores
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org admins can insert stores" ON stores;
CREATE POLICY "Org admins can insert stores"
  ON stores
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Org admins can update stores" ON stores;
CREATE POLICY "Org admins can update stores"
  ON stores
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Org admins can delete stores" ON stores;
CREATE POLICY "Org admins can delete stores"
  ON stores
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow public access for report viewing (anonymous)
DROP POLICY IF EXISTS "Allow public report store access" ON stores;
CREATE POLICY "Allow public report store access"
  ON stores
  FOR SELECT
  USING (
    -- Allow if the organization has at least one public report
    (auth.uid() IS NULL AND organization_id IN (
      SELECT DISTINCT organization_id FROM reports WHERE share_link IS NOT NULL
    ))
  );
