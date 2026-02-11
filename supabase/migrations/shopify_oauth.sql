-- Shopify OAuth Database Migration
-- Run this in Supabase SQL Editor to create the necessary tables

-- Create shopify_stores table
CREATE TABLE IF NOT EXISTS shopify_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, shop)
);

-- Enable RLS
ALTER TABLE shopify_stores ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Users can view their own Shopify stores" ON shopify_stores;
CREATE POLICY "Users can view their own Shopify stores"
  ON shopify_stores
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own Shopify stores" ON shopify_stores;
CREATE POLICY "Users can insert their own Shopify stores"
  ON shopify_stores
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own Shopify stores" ON shopify_stores;
CREATE POLICY "Users can update their own Shopify stores"
  ON shopify_stores
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own Shopify stores" ON shopify_stores;
CREATE POLICY "Users can delete their own Shopify stores"
  ON shopify_stores
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shopify_stores_user_id ON shopify_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_stores_shop ON shopify_stores(shop);
