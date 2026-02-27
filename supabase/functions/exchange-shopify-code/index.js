import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const adminClient = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null

function normalizeShop(shop) {
  if (!shop) return ''
  return String(shop)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function getCachedExchange(codeHash, shop) {
  if (!adminClient) return null

  const { data, error } = await adminClient
    .from('shopify_code_cache')
    .select('shop, access_token')
    .eq('code_hash', codeHash)
    .maybeSingle()

  if (error) {
    console.error('[exchange-shopify-code] Failed to read code cache:', error)
    return null
  }

  if (!data || data.shop !== shop) return null
  return data.access_token
}

async function cacheExchange(codeHash, shop, accessToken) {
  if (!adminClient) return

  const { error } = await adminClient
    .from('shopify_code_cache')
    .upsert({ code_hash: codeHash, shop, access_token: accessToken }, { onConflict: 'code_hash' })

  if (error) {
    console.error('[exchange-shopify-code] Failed to write code cache:', error)
  }
}

serve(async (req) => {
  console.log('[exchange-shopify-code] Incoming request:', req.method)

  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body
    try {
      const text = await req.text()
      console.log('[exchange-shopify-code] Request body:', text)
      body = JSON.parse(text)
    } catch (e) {
      console.error('[exchange-shopify-code] Failed to parse request body:', e)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const shop = normalizeShop(body?.shop)
    const code = body?.code
    const redirectUriFromClient = body?.redirect_uri

    console.log('[exchange-shopify-code] Extracted shop:', shop, 'code:', code ? 'present' : 'missing')

    if (!shop || !code) {
      return new Response(
        JSON.stringify({ error: 'Missing shop or code parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const clientId = Deno.env.get('SHOPIFY_CLIENT_ID')
    const clientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')
    const redirectUri = redirectUriFromClient || Deno.env.get('SHOPIFY_REDIRECT_URI')

    console.log('[exchange-shopify-code] Client ID available:', !!clientId)
    console.log('[exchange-shopify-code] Client Secret available:', !!clientSecret)
    console.log('[exchange-shopify-code] Redirect URI available:', !!redirectUri)

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('[exchange-shopify-code] Missing Shopify credentials')
      return new Response(
        JSON.stringify({ error: 'Server configuration error - missing credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const codeHash = await sha256Hex(`${shop}:${code}`)

    const cachedToken = await getCachedExchange(codeHash, shop)
    if (cachedToken) {
      console.log('[exchange-shopify-code] Returning cached token for duplicate code exchange')
      return new Response(
        JSON.stringify({ access_token: cachedToken, shop, cached: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tokenUrl = `https://${shop}/admin/oauth/access_token`
    console.log('[exchange-shopify-code] Requesting token from:', tokenUrl)

    const tokenBody = `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`
    console.log('[exchange-shopify-code] Request body prepared')

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    })

    console.log('[exchange-shopify-code] Shopify response status:', tokenResponse.status)

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('[exchange-shopify-code] Shopify error response:', errorText.substring(0, 1000))

      let errorData = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { raw_error: errorText }
      }

      return new Response(
        JSON.stringify({ error: 'Failed to exchange code for token', details: errorData }),
        { status: tokenResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let tokenData
    try {
      tokenData = await tokenResponse.json()
    } catch (e) {
      console.error('[exchange-shopify-code] Failed to parse token response:', e)
      return new Response(
        JSON.stringify({ error: 'Invalid response from Shopify' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[exchange-shopify-code] Token data received, access_token present:', !!tokenData.access_token)

    if (tokenData.error) {
      console.error('[exchange-shopify-code] Shopify OAuth error:', tokenData)
      return new Response(
        JSON.stringify({ error: tokenData.error || 'oauth_error', details: tokenData }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (tokenData.access_token) {
      await cacheExchange(codeHash, shop, tokenData.access_token)
    }

    console.log('[exchange-shopify-code] OAuth exchange successful')
    return new Response(
      JSON.stringify({ access_token: tokenData.access_token, shop }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[exchange-shopify-code] Unhandled error:', error)

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
