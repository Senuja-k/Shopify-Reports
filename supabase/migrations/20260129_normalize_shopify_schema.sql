-- Normalized Shopify data schema for fast, local reporting
-- Mirrors Shopify products, variants, metafields, and orders without re-querying the API

-- ============= PRODUCTS TABLE =============
-- One row per Shopify product per store
CREATE TABLE IF NOT EXISTS shopify_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Shopify IDs
  shopify_product_id TEXT NOT NULL,
  
  -- Product fields
  title TEXT NOT NULL,
  description TEXT,
  handle TEXT,
  vendor TEXT,
  product_type TEXT,
  status TEXT, -- ACTIVE, DRAFT, ARCHIVED
  tags TEXT[] DEFAULT '{}', -- Array of tags
  
  -- Dates
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  
  -- Sync tracking
  shopify_updated_at TIMESTAMP WITH TIME ZONE, -- Latest update from Shopify
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE, -- Soft delete for historical reporting
  
  db_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  db_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE (store_id, shopify_product_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_products_store_id ON shopify_products(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_user_id ON shopify_products(user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_shopify_id ON shopify_products(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_synced_at ON shopify_products(synced_at);
CREATE INDEX IF NOT EXISTS idx_shopify_products_is_deleted ON shopify_products(is_deleted);

-- ============= VARIANTS TABLE =============
-- One row per Shopify variant per store
CREATE TABLE IF NOT EXISTS shopify_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES shopify_products(id) ON DELETE CASCADE,
  
  -- Shopify IDs
  shopify_variant_id TEXT NOT NULL,
  shopify_product_id TEXT NOT NULL, -- Denormalized for easy filtering
  
  -- Variant fields
  title TEXT,
  sku TEXT,
  barcode TEXT,
  price NUMERIC(12, 2),
  compare_at_price NUMERIC(12, 2),
  cost NUMERIC(12, 2),
  weight NUMERIC(10, 3),
  weight_unit TEXT, -- lb, kg, oz, g
  
  -- Inventory
  tracked BOOLEAN DEFAULT TRUE,
  inventory_quantity INTEGER DEFAULT 0,
  inventory_policy TEXT, -- CONTINUE, DENY
  
  -- Dates
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Sync tracking
  shopify_updated_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE,
  
  db_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  db_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE (store_id, shopify_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_variants_store_id ON shopify_variants(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_user_id ON shopify_variants(user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_product_id ON shopify_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_shopify_id ON shopify_variants(shopify_variant_id);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_sku ON shopify_variants(sku);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_synced_at ON shopify_variants(synced_at);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_is_deleted ON shopify_variants(is_deleted);

-- ============= PRODUCT METAFIELDS TABLE =============
-- Store product-level and variant-level metafields
CREATE TABLE IF NOT EXISTS shopify_product_metafields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID REFERENCES shopify_products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES shopify_variants(id) ON DELETE CASCADE,
  
  -- Shopify IDs
  shopify_metafield_id TEXT NOT NULL,
  
  -- Metafield structure
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  value_type TEXT, -- STRING, INTEGER, JSON_STRING, BOOLEAN, DATE, DATETIME, RICH_TEXT_HTML, MONEY, RATING, VOLUME, WEIGHT, DIMENSION
  
  -- Tracking
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  db_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  db_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE (store_id, shopify_metafield_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_metafields_store_id ON shopify_product_metafields(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_metafields_user_id ON shopify_product_metafields(user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_metafields_product_id ON shopify_product_metafields(product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_metafields_variant_id ON shopify_product_metafields(variant_id);
CREATE INDEX IF NOT EXISTS idx_shopify_metafields_namespace_key ON shopify_product_metafields(namespace, key);

-- ============= ORDERS TABLE =============
-- One row per Shopify order per store
CREATE TABLE IF NOT EXISTS shopify_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Shopify IDs
  shopify_order_id TEXT NOT NULL,
  shopify_order_number TEXT, -- Human-readable order number
  
  -- Order info
  name TEXT, -- Order name (e.g., #1001)
  email TEXT,
  phone TEXT,
  status TEXT, -- UNFULFILEED, FULFILLED, PARTIALLY_FULFILLED, RESTOCKED, CANCELLED
  financial_status TEXT, -- AUTHORIZED, PENDING, PAID, REFUNDED, VOIDED
  fulfillment_status TEXT, -- UNFULFILELD, PARTIAL, FULFILLED, RESTOCKED, CANCELLED
  
  -- Totals
  subtotal NUMERIC(12, 2),
  total_tax NUMERIC(12, 2),
  total_discounts NUMERIC(12, 2),
  total_price NUMERIC(12, 2),
  
  -- Customer
  customer_id TEXT,
  
  -- Dates
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Sync tracking
  shopify_updated_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  db_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  db_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE (store_id, shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_store_id ON shopify_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_user_id ON shopify_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_shopify_id ON shopify_orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at ON shopify_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_synced_at ON shopify_orders(synced_at);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_status ON shopify_orders(status);

-- ============= ORDER LINE ITEMS TABLE =============
-- One row per line item per order (for SKU-level reporting)
CREATE TABLE IF NOT EXISTS shopify_order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES shopify_orders(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES shopify_variants(id),
  
  -- Shopify IDs
  shopify_line_item_id TEXT NOT NULL,
  shopify_variant_id TEXT,
  shopify_product_id TEXT,
  
  -- Line item details
  title TEXT,
  sku TEXT,
  quantity INTEGER,
  price NUMERIC(12, 2), -- Price per unit
  total_discount NUMERIC(12, 2),
  tax NUMERIC(12, 2),
  
  -- Fulfillment
  fulfillment_status TEXT, -- FULFILLED, PARTIAL, UNFULFILLD, RESTOCKED, CANCELLED
  
  -- Dates
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Sync tracking
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  db_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  db_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE (store_id, shopify_line_item_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_line_items_store_id ON shopify_order_line_items(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_line_items_user_id ON shopify_order_line_items(user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_line_items_order_id ON shopify_order_line_items(order_id);
CREATE INDEX IF NOT EXISTS idx_shopify_line_items_variant_id ON shopify_order_line_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_shopify_line_items_sku ON shopify_order_line_items(sku);
CREATE INDEX IF NOT EXISTS idx_shopify_line_items_synced_at ON shopify_order_line_items(synced_at);

-- ============= SYNC TRACKING =============
-- Enhanced sync status with per-entity tracking
CREATE TABLE IF NOT EXISTS shopify_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Entity-level sync tracking
  last_product_sync_at TIMESTAMP WITH TIME ZONE,
  next_product_sync_at TIMESTAMP WITH TIME ZONE,
  
  last_order_sync_at TIMESTAMP WITH TIME ZONE,
  next_order_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Status tracking
  is_syncing BOOLEAN DEFAULT FALSE,
  last_sync_error TEXT,
  last_sync_error_at TIMESTAMP WITH TIME ZONE,
  
  db_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  db_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE (store_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_sync_status_store_id ON shopify_sync_status(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_status_user_id ON shopify_sync_status(user_id);

-- ============= ROW LEVEL SECURITY =============

-- Products RLS
ALTER TABLE shopify_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own products" ON shopify_products;
CREATE POLICY "Users can view their own products"
  ON shopify_products FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can modify their own products" ON shopify_products;
CREATE POLICY "Users can modify their own products"
  ON shopify_products FOR INSERT, UPDATE, DELETE
  WITH CHECK (auth.uid() = user_id);

-- Variants RLS
ALTER TABLE shopify_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own variants" ON shopify_variants;
CREATE POLICY "Users can view their own variants"
  ON shopify_variants FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can modify their own variants" ON shopify_variants;
CREATE POLICY "Users can modify their own variants"
  ON shopify_variants FOR INSERT, UPDATE, DELETE
  WITH CHECK (auth.uid() = user_id);

-- Product Metafields RLS
ALTER TABLE shopify_product_metafields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own metafields" ON shopify_product_metafields;
CREATE POLICY "Users can view their own metafields"
  ON shopify_product_metafields FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can modify their own metafields" ON shopify_product_metafields;
CREATE POLICY "Users can modify their own metafields"
  ON shopify_product_metafields FOR INSERT, UPDATE, DELETE
  WITH CHECK (auth.uid() = user_id);

-- Orders RLS
ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own orders" ON shopify_orders;
CREATE POLICY "Users can view their own orders"
  ON shopify_orders FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can modify their own orders" ON shopify_orders;
CREATE POLICY "Users can modify their own orders"
  ON shopify_orders FOR INSERT, UPDATE, DELETE
  WITH CHECK (auth.uid() = user_id);

-- Order Line Items RLS
ALTER TABLE shopify_order_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own line items" ON shopify_order_line_items;
CREATE POLICY "Users can view their own line items"
  ON shopify_order_line_items FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can modify their own line items" ON shopify_order_line_items;
CREATE POLICY "Users can modify their own line items"
  ON shopify_order_line_items FOR INSERT, UPDATE, DELETE
  WITH CHECK (auth.uid() = user_id);

-- Sync Status RLS
ALTER TABLE shopify_sync_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own sync status" ON shopify_sync_status;
CREATE POLICY "Users can view their own sync status"
  ON shopify_sync_status FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can modify their own sync status" ON shopify_sync_status;
CREATE POLICY "Users can modify their own sync status"
  ON shopify_sync_status FOR INSERT, UPDATE, DELETE
  WITH CHECK (auth.uid() = user_id);
