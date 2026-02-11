-- Shopify products cache + sync status
-- Stores flattened variant rows per store and user

CREATE TABLE IF NOT EXISTS shopify_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  shopify_variant_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (store_id, shopify_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_products_user_id ON shopify_products(user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_store_id ON shopify_products(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_variant_id ON shopify_products(shopify_variant_id);

ALTER TABLE shopify_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own cached products" ON shopify_products;
CREATE POLICY "Users can view their own cached products"
  ON shopify_products
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own cached products" ON shopify_products;
CREATE POLICY "Users can insert their own cached products"
  ON shopify_products
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own cached products" ON shopify_products;
CREATE POLICY "Users can update their own cached products"
  ON shopify_products
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own cached products" ON shopify_products;
CREATE POLICY "Users can delete their own cached products"
  ON shopify_products
  FOR DELETE
  USING (auth.uid() = user_id);

-- Track per-store sync status
CREATE TABLE IF NOT EXISTS shopify_store_sync_status (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  next_sync_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_sync_user_id ON shopify_store_sync_status(user_id);

ALTER TABLE shopify_store_sync_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sync status" ON shopify_store_sync_status;
CREATE POLICY "Users can view their own sync status"
  ON shopify_store_sync_status
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own sync status" ON shopify_store_sync_status;
CREATE POLICY "Users can insert their own sync status"
  ON shopify_store_sync_status
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own sync status" ON shopify_store_sync_status;
CREATE POLICY "Users can update their own sync status"
  ON shopify_store_sync_status
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own sync status" ON shopify_store_sync_status;
CREATE POLICY "Users can delete their own sync status"
  ON shopify_store_sync_status
  FOR DELETE
  USING (auth.uid() = user_id);
