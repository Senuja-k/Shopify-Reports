import { serve } from "https://deno.land/std@0.168.0/http/server.js"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

serve(async (req) => {
  console.log('[public-report-data] Incoming request:', req.method)
  
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers,
      })
    }

    // Parse request body
    let body
    try {
      const text = await req.text()
      body = JSON.parse(text)
    } catch (e) {
      console.error('[public-report-data] Failed to parse request body:', e)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { shareLink, storeId, organizationId, storeIds } = body
    
    console.log('[public-report-data] Request:', { shareLink, storeId, organizationId, storeIds })

    if (!shareLink) {
      return new Response(
        JSON.stringify({ error: 'Missing shareLink parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    console.log('[public-report-data] Supabase URL:', supabaseUrl ? 'present' : 'missing')
    console.log('[public-report-data] Service Key:', supabaseServiceKey ? 'present' : 'missing')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error - missing environment variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // If storeId is 'all-stores', we need to get all stores for this organization first
    let targetStoreIds = []
    
    if (storeId === 'all-stores' && organizationId) {
      // Get all stores for this organization
      console.log('[public-report-data] Fetching stores for organization:', organizationId)
      const { data, error: storesError } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('organization_id', organizationId)
      
      if (storesError) {
        console.error('[public-report-data] Error fetching stores:', storesError)
      } else if (stores && stores.length > 0) {
        targetStoreIds = stores.map((s) => s.id)
        console.log('[public-report-data] Found stores:', targetStoreIds)
      }
    } else if (storeIds && Array.isArray(storeIds) && storeIds.length > 0) {
      targetStoreIds = storeIds
    } else if (storeId && storeId !== 'all-stores') {
      targetStoreIds = [storeId]
    }

    console.log('[public-report-data] Target store IDs:', targetStoreIds)

    // Build query for products
    let query = supabase
      .from('shopify_products')
      .select('*')

    // Filter by store(s)
    if (targetStoreIds.length > 0) {
      query = query.in('store_id', targetStoreIds)
    } else if (organizationId) {
      // Fallback: filter by organization if no stores found
      query = query.eq('organization_id', organizationId)
    }

    console.log('[public-report-data] Executing products query...')
    const { data, error } = await query

    if (error) {
      console.error('[public-report-data] Database error:', JSON.stringify(error))
      return new Response(
        JSON.stringify({ error: 'Failed to fetch products', details, code: error.code }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[public-report-data] Fetched ${products?.length || 0} products`)

    // Get sync status for the stores
    let syncQuery = supabase
      .from('shopify_store_sync_status')
      .select('store_id, last_product_sync_at')

    if (targetStoreIds.length > 0) {
      syncQuery = syncQuery.in('store_id', targetStoreIds)
    } else if (organizationId) {
      syncQuery = syncQuery.eq('organization_id', organizationId)
    }

    const { data, error: syncError } = await syncQuery

    if (syncError) {
      console.error('[public-report-data] Sync status error:', JSON.stringify(syncError))
      // Don't fail the request, just log the error
    }

    // Find the latest sync time
    let lastSyncAt | null = null
    if (syncStatuses && syncStatuses.length > 0) {
      const syncTimes = syncStatuses
        .map((s) => s.last_product_sync_at)
        .filter(Boolean)[]
      if (syncTimes.length > 0) {
        lastSyncAt = syncTimes.sort().at(-1) || null
      }
    }

    return new Response(
      JSON.stringify({ 
        products || [],
        lastSyncAt,
        count: products?.length || 0
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[public-report-data] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
