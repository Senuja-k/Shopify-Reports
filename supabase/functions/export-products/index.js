    // Use the npm: prefix so Deno's bundler can include the package.
    import { createClient } from 'npm:@supabase/supabase-js';

    // Edge Function: export-products
    // Expects JSON body: { storeIds: [...], organizationId: string|null, filterConfig: {...}, selectedColumns: [...] }

    // Use Deno.env for environment variables in Edge Functions
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

// Simple filter application (supports a subset of operators)
function applyFilters(query, filterConfig) {
  if (!filterConfig || !Array.isArray(filterConfig.items) || filterConfig.items.length === 0) return query;

  for (const item of filterConfig.items) {
    if (typeof item !== 'object' || !item.field) continue;
    const field = `data->>${item.field}`;
    const val = item.value ?? '';
    switch (item.operator) {
      case 'equals':
        query = query.ilike(field, val);
        break;
      case 'contains':
        query = query.ilike(field, `%${val}%`);
        break;
      case 'starts_with':
        query = query.ilike(field, `${val}%`);
        break;
      case 'ends_with':
        query = query.ilike(field, `%${val}`);
        break;
      case 'greater_than':
        query = query.gt(field, val);
        break;
      case 'less_than':
        query = query.lt(field, val);
        break;
      default:
        // Unsupported operator: skip
        break;
    }
  }
  return query;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const body = await req.text();
    const payload = body ? JSON.parse(body) : {};
    const { storeIds = [], organizationId = null, filterConfig = {}, selectedColumns = [] } = payload;

    if (!Array.isArray(storeIds) || storeIds.length === 0) {
      res.status(400).send('storeIds required');
      return;
    }

    // Build base query
    let q = supabase
      .from('shopify_products')
      .select('id, store_id, data')
      .in('store_id', storeIds);

    if (organizationId) q = q.eq('organization_id', organizationId);

    q = applyFilters(q, filterConfig);

    // Count
    const { count, error: countError } = await q.range(0, 0).maybeSingle();
    // We'll ignore count errors and proceed to fetch in batches

    // Fetch all rows in batches
    const batchSize = 500;
    let offset = 0;
    const rows = [];
    while (true) {
      const { data, error } = await q.range(offset, offset + batchSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < batchSize) break;
      offset += batchSize;
    }

    // Determine columns
    const cols = Array.isArray(selectedColumns) && selectedColumns.length > 0
      ? selectedColumns
      : // detect keys from first row
        Object.keys((rows[0]?.data) || {}).slice(0, 50);

    // Build CSV
    const header = ['id','store_id', ...cols];
    const lines = [header.join(',')];
    for (const row of rows) {
      const d = row.data || {};
      const vals = [row.id, row.store_id, ...cols.map(c => {
        const v = d[c];
        if (v === null || v === undefined) return '';
        // escape quotes
        return (`"${String(v).replace(/"/g, '""')}"`);
      })];
      lines.push(vals.join(','));
    }

    const csv = lines.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="shopify-products-export.csv"');
    res.status(200).send(csv);
  } catch (error) {
    console.error('[export-products] Error:', error);
    res.status(500).send('Export failed');
  }
}
