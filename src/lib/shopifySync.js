import { fetchProductsFromStore } from '@/lib/shopify';
import {
  getSyncStatus,
  updateSyncStatus,
} from '@/lib/shopify-sync-utils';
import { supabase } from './supabase';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Get the latest sync time for an organization from the DB.
 * Returns the most recent last_synced_at across all stores in the org, or null.
 */
export async function getOrgLastSyncTime(organizationId, storeIds) {
  try {
    let query = supabase
      .from('shopify_store_sync_status')
      .select('last_synced_at')
      .in('store_id', storeIds)
      .not('last_synced_at', 'is', null)
      .order('last_synced_at', { ascending: false })
      .limit(1);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('[getOrgLastSyncTime] Error:', error);
      return null;
    }

    const lastSync = data?.last_synced_at || null;
    console.log(`[getOrgLastSyncTime] Latest sync for org ${organizationId}: ${lastSync}`);
    return lastSync;
  } catch (err) {
    console.error('[getOrgLastSyncTime] Error:', err);
    return null;
  }
}

/**
 * Check if org sync is due: returns true if last sync was > 2 hours ago
 * Returns false if < 2 hours (no sync needed)
 * Returns false if no sync history (first sync should be manual)
 */
export function isOrgSyncDue(lastSyncedAt) {
  if (!lastSyncedAt) {
    console.log('[isOrgSyncDue] No last sync time - skipping auto-sync (use refresh button for first sync)');
    return false;
  }
  const last = new Date(lastSyncedAt).getTime();
  const now = Date.now();
  const timeSince = now - last;
  const isDue = timeSince >= TWO_HOURS_MS;

  const minutesSince = Math.floor(timeSince / 1000 / 60);
  const minutesUntilDue = Math.max(0, Math.floor((TWO_HOURS_MS - timeSince) / 1000 / 60));

  console.log(`[isOrgSyncDue] Last sync: ${lastSyncedAt} (${minutesSince} minutes ago)`);
  console.log(`[isOrgSyncDue] Sync ${isDue ? 'IS' : 'NOT'} due ${isDue ? '' : `(${minutesUntilDue} minutes remaining)`}`);

  return isDue;
}

/**
 * Full sync for a store - fetches all products and syncs to database
 * Marks any products not in this sync (soft delete)
 */
export async function syncStoreProductsFull(
  userId,
  store,
  organizationId
) {
  const syncTimestamp = new Date().toISOString();
  
  console.log(`%c[syncStoreProductsFull] ======= Starting full sync =======`, 'color: blue; font-weight: bold');
  console.log(`[syncStoreProductsFull] Store: ${store.name} (${store.id})`);
  console.log(`[syncStoreProductsFull] Organization: ${organizationId || 'none'}`);
  console.log(`[syncStoreProductsFull] User: ${userId}`);
  console.log(`[syncStoreProductsFull] Timestamp: ${syncTimestamp}`);

  try {
    // Fetch all products from Shopify
    console.log(`[syncStoreProductsFull] Fetching products from Shopify API...`);
    const allFetchedProducts = await fetchProductsFromStore({
      ...store,
      organizationId,
    });
    console.log(`%c[syncStoreProductsFull] ? Fetched ${allFetchedProducts.length} product variants from Shopify`, 'color: green; font-weight: bold');    console.log(`%c[syncStoreProductsFull] ?? Store: ${store.name}, Variants fetched: ${allFetchedProducts.length}`, 'background: green; color: white; font-weight: bold; font-size: 14px');    
    // Log all unique SKUs for debugging
    const allSkus = allFetchedProducts
      .map(p => p.sku || p.variantSku)
      .filter(Boolean);
    console.log(`[syncStoreProductsFull] All SKUs found (${allSkus.length}):`, allSkus.slice(0, 50));
    if (allSkus.length > 50) {
      console.log(`[syncStoreProductsFull] ... and ${allSkus.length - 50} more SKUs`);
    }
    
    // Log products with 'test' in SKU for debugging
    const testSkuProducts = allFetchedProducts.filter(p => 
      p.sku?.toLowerCase().includes('test') || 
      p.variantSku?.toLowerCase().includes('test')
    );
    if (testSkuProducts.length > 0) {
      console.log(`%c[syncStoreProductsFull] Products with 'test' in SKU:`, 'color: orange', testSkuProducts.map(p => ({
        title: p.title,
        sku: p.sku || p.variantSku,
        variantId: p.variantId
      })));
    } else {
      console.log(`%c[syncStoreProductsFull] No products found with 'test' in SKU`, 'color: orange');
    }

    // For the old schema, we store each variant row with JSONB data
    const productsToUpsert = allFetchedProducts.map(product => ({
      user_id: userId,
      organization_id: organizationId,
      store_id: store.id,
      shopify_product_id: product.productId?.toString() || product.id?.toString(),
      shopify_variant_id: product.variantId?.toString() || product.id?.toString(),
      data: product, // Store entire product
      updated_at: new Date().toISOString(),
    }));
    
    console.log(`[syncStoreProductsFull] Prepared ${productsToUpsert.length} records to upsert`);
    console.log(`%c[syncStoreProductsFull] ?? DATABASE: Upserting ${productsToUpsert.length} variant rows`, 'background: blue; color: white; font-weight: bold; font-size: 14px');

    // Batch upsert (100 at a time to avoid payload limits)
    const BATCH_SIZE = 100;
    let totalUpserted = 0;
    for (let i = 0; i < productsToUpsert.length; i += BATCH_SIZE) {
      const batch = productsToUpsert.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(productsToUpsert.length / BATCH_SIZE);
      
      console.log(`[syncStoreProductsFull] Upserting batch ${batchNumber}/${totalBatches} (${batch.length} records)`);
      
      const { data, error, count } = await supabase
        .from('shopify_products')
        .upsert(batch, { onConflict: 'store_id,shopify_variant_id', count: 'exact' });
      
      if (error) {
        console.error(`[syncStoreProductsFull] Error in batch ${batchNumber}:`, error);
        console.error(`[syncStoreProductsFull] Failed batch sample:`, batch.slice(0, 2));
        throw error;
      }
      
      totalUpserted += batch.length;
      console.log(`[syncStoreProductsFull] ? Batch ${batchNumber} complete. Total upserted so far: ${totalUpserted}/${productsToUpsert.length}`);
    }
    
    console.log(`[syncStoreProductsFull] ? All batches complete. Total records upserted: ${totalUpserted}`);    console.log(`%c[syncStoreProductsFull] ? DATABASE UPSERT COMPLETE: ${totalUpserted} rows saved`, 'background: green; color: white; font-weight: bold; font-size: 14px');
    // Delete products that weren't in this sync (by variant ID, not just timestamp)
    const variantIds = allFetchedProducts.map(p => p.variantId);
    let deleteQuery = supabase
      .from('shopify_products')
      .delete()
      .eq('user_id', userId)
      .eq('store_id', store.id)
      .not('shopify_variant_id', 'in', `(${variantIds.map(id => `'${id}'`).join(',')})`);
    if (organizationId) {
      deleteQuery = deleteQuery.eq('organization_id', organizationId);
    }
    const { error: deleteError, count: deleteCount } = await deleteQuery;
    if (deleteError) {
      console.error(`[syncStoreProductsFull] Error deleting old products:`, deleteError);
    } else {
      console.log(`[syncStoreProductsFull] ? Deleted ${deleteCount || 0} old products not in Shopify`);
    }

    // Verify what was actually saved to database
    const { count: dbCount } = await supabase
      .from('shopify_products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id);
    
    console.log(`[syncStoreProductsFull] Database verification: ${dbCount} total records for this store`);
    console.log(`%c[syncStoreProductsFull] ?? VERIFICATION: ${dbCount} rows in database for store`, 'background: orange; color: white; font-weight: bold; font-size: 14px');
    if (dbCount !== productsToUpsert.length) {
      console.warn(`%c[syncStoreProductsFull] ?? MISMATCH Tried to upsert ${productsToUpsert.length} but database has ${dbCount}`, 'background: red; color: white; font-weight: bold; font-size: 16px');
    } else {
      console.log(`%c[syncStoreProductsFull] ? MATCH: Upserted ${productsToUpsert.length} = Database ${dbCount}`, 'background: green; color: white; font-weight: bold; font-size: 14px');
    }

    // Update sync status
    await updateSyncStatus(userId, store.id, {
      last_product_sync_at: syncTimestamp,
    }, organizationId);

    const next = new Date(new Date(syncTimestamp).getTime() + TWO_HOURS_MS);
    console.log(`[syncStoreProductsFull] ? Full sync complete`);
    console.log(`[syncStoreProductsFull] Synced at: ${syncTimestamp}`);
    console.log(`[syncStoreProductsFull] Next sync due: ${next.toISOString()}`);
    console.log(`[syncStoreProductsFull] ==============================`);
  } catch (error) {
    console.error(`[syncStoreProductsFull] Error:`, error);
    await updateSyncStatus(userId, store.id, {
      last_sync_error: error instanceof Error ? error.message : String(error),
    }, organizationId);
    throw error;
  }
}

/**
 * Sync multiple stores in parallel
 */
export async function syncStoresProductsFull(
  userId,
  stores,
  organizationId
) {
  console.log(`%c[syncStoresProductsFull] ======= Starting multi-store sync =======`, 'color: blue; font-weight: bold; font-size: 16px');
  console.log(`%c[syncStoresProductsFull] Syncing ${stores.length} stores for organization`, 'color: blue; font-weight: bold');
  console.log(`[syncStoresProductsFull] Stores: ${stores.map(s => s.name).join(', ')}`);

  const results = await Promise.allSettled(
    stores.map((store) => syncStoreProductsFull(userId, store, organizationId))
  );

  let successCount = 0;
  let failCount = 0;
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failCount++;
      console.error(`[syncStoresProductsFull] ? Store ${stores[index].name} failed:`, result.reason);
    } else {
      successCount++;
      console.log(`[syncStoresProductsFull] ? Store ${stores[index].name} completed successfully`);
    }
  });

  console.log(`%c[syncStoresProductsFull] ? MULTI-STORE SYNC COMPLETE`, 'background: green; color: white; font-weight: bold; font-size: 16px');
  console.log(`%c[syncStoresProductsFull] ?? Summary: ${successCount} succeeded, ${failCount} failed out of ${stores.length} stores`, 'background: blue; color: white; font-weight: bold; font-size: 14px');
  console.log(`%c[syncStoresProductsFull] ======= End multi-store sync =======`, 'color: blue; font-weight: bold; font-size: 16px');
}

/**
 * Check if a sync is due based on last sync time
 */
export function isSyncDue(lastSyncedAt) {
  if (!lastSyncedAt) {
    console.log('[isSyncDue] No last sync time - skipping auto-sync (use refresh button for first sync)');
    return false;
  }
  const last = new Date(lastSyncedAt).getTime();
  const now = Date.now();
  const timeSince = now - last;
  const isDue = timeSince >= TWO_HOURS_MS;
  
  const minutesSince = Math.floor(timeSince / 1000 / 60);
  const minutesUntilDue = Math.floor((TWO_HOURS_MS - timeSince) / 1000 / 60);
  
  console.log(`[isSyncDue] Last sync: ${lastSyncedAt} (${minutesSince} minutes ago)`);
  console.log(`[isSyncDue] Sync ${isDue ? 'IS' : 'NOT'} due ${isDue ? '' : `(${minutesUntilDue} minutes remaining)`}`);
  
  return isDue;
}
