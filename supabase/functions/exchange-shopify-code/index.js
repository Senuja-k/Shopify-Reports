import { serve } from "https://deno.land/std@0.168.0/http/server.js"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

serve(async (req) => {
  console.log('[exchange-shopify-code] Incoming request:', req.method)
  
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
      console.log('[exchange-shopify-code] Request body:', text)
      body = JSON.parse(text)
    } catch (e) {
      console.error('[exchange-shopify-code] Failed to parse request body:', e)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { shop, code } = body
    
    console.log('[exchange-shopify-code] Extracted shop:', shop, 'code:', code ? 'present' : 'missing')

    if (!shop || !code) {
      return new Response(
        JSON.stringify({ error: 'Missing shop or code parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get environment variables
    const clientId = Deno.env.get('SHOPIFY_CLIENT_ID')
    const clientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')
    const redirectUri = Deno.env.get('SHOPIFY_REDIRECT_URI')

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

    // Build the URL
    const tokenUrl = `https://${shop}/admin/oauth/access_token`
    console.log('[exchange-shopify-code] Requesting token from:', tokenUrl)

    // Exchange code for access token
    const tokenBody = `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}&grant_type=authorization_code`
    
    console.log('[exchange-shopify-code] Request body prepared')
    console.log('[exchange-shopify-code] Body sample:', tokenBody.substring(0, 80) + '...')
    console.log('[exchange-shopify-code] client_id in body:', tokenBody.includes('client_id=') ? 'YES' : 'NO')
    console.log('[exchange-shopify-code] client_secret in body:', tokenBody.includes('client_secret=') ? 'YES' : 'NO')
    console.log('[exchange-shopify-code] code in body:', tokenBody.includes('code=') ? 'YES' : 'NO')
    console.log('[exchange-shopify-code] redirect_uri in body:', tokenBody.includes('redirect_uri=') ? 'YES' : 'NO')

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body,
    })

    console.log('[exchange-shopify-code] Shopify response status:', tokenResponse.status)

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('[exchange-shopify-code] Shopify error response:', errorText.substring(0, 500))
      
      let errorData = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { raw_error: errorText.substring(0, 200) }
      }
      
      return new Response(
        JSON.stringify({
          error: 'Failed to exchange code for token',
          details,
        }),
        {
          status,
          headers,
        }
      )
    }

    // Parse token response
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
        JSON.stringify({
          error,
          error_description,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Success
    console.log('[exchange-shopify-code] OAuth exchange successful')
    return new Response(
      JSON.stringify({
        access_token,
        shop,
      }),
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
