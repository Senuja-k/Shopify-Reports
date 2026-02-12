/**
 * Server-side query helpers for paginated, filtered product queries.
 *
 * All queries go against the `shopify_products` table whose data lives
 * inside a JSONB `data` column.  The helpers translate the flat filter
 * config used by FilterBuilder into Supabase PostgREST operators so
 * filtering, sorting and pagination happen on the database.
 */

import { supabase, ensureValidSession } from './supabase';

// ---------------------------------------------------------------------------
// Filter → Supabase query translation
// ---------------------------------------------------------------------------

function applyConditionToQuery(query, condition) {
  const col = `data->>${condition.field}`;
  const val = condition.value ?? '';
  const val2 = condition.value2 ?? '';

  switch (condition.operator) {
    case 'equals':
      return query.ilike(col, val);
    case 'not_equals':
      return query.not(col, 'ilike', val);
    case 'contains':
      return query.ilike(col, `%${val}%`);
    case 'not_contains':
      return query.not(col, 'ilike', `%${val}%`);
    case 'starts_with':
      return query.ilike(col, `${val}%`);
    case 'ends_with':
      return query.ilike(col, `%${val}`);

    case 'greater_than':
      return query.gt(col, val);
    case 'less_than':
      return query.lt(col, val);
    case 'greater_than_or_equal':
      return query.gte(col, val);
    case 'less_than_or_equal':
      return query.lte(col, val);
    case 'between':
      return query.gte(col, val).lte(col, val2);

    case 'in_list': {
      const list = condition.valueList || [];
      if (list.length === 0) return query;
      return query.in(col, list);
    }

    case 'is_blank':
      return query.is(col, null);
    case 'is_not_blank':
      return query.not(col, 'is', null);

    default:
      console.warn(`[serverQueries] Unknown operator: ${condition.operator}`);
      return query;
  }
}

function applyFiltersToQuery(query, filterConfig) {
  if (!filterConfig?.items?.length) return query;

  const conditions = [];
  const logicOps = [];

  for (const item of filterConfig.items) {
    if (typeof item === 'object' && item && 'id' in item) {
      conditions.push(item);
    } else if (typeof item === 'string') {
      logicOps.push(item);
    }
  }

  if (conditions.length === 0) return query;

  const hasOr = logicOps.includes('OR');

  if (!hasOr) {
    for (const cond of conditions) {
      query = applyConditionToQuery(query, cond);
    }
    return query;
  }

  const orParts = [];
  let andGroup = [conditions[0]];

  for (let i = 1; i < conditions.length; i++) {
    const op = logicOps[i - 1] || 'AND';
    if (op === 'OR') {
      orParts.push(andGroup);
      andGroup = [conditions[i]];
    } else {
      andGroup.push(conditions[i]);
    }
  }
  orParts.push(andGroup);

  if (orParts.length === 1) {
    for (const cond of orParts[0]) {
      query = applyConditionToQuery(query, cond);
    }
    return query;
  }

  const orExpressions = orParts.map((group) => {
    if (group.length === 1) {
      return conditionToPostgrestString(group[0]);
    }
    const andExprs = group.map(conditionToPostgrestString);
    return `and(${andExprs.join(',')})`;
  });

  query = query.or(orExpressions.join(','));
  return query;
}

function conditionToPostgrestString(condition) {
  const col = `data->>${condition.field}`;
  const val = condition.value ?? '';
  const val2 = condition.value2 ?? '';

  switch (condition.operator) {
    case 'equals':
      return `${col}.ilike.${val}`;
    case 'not_equals':
      return `${col}.not.ilike.${val}`;
    case 'contains':
      return `${col}.ilike.%${val}%`;
    case 'not_contains':
      return `${col}.not.ilike.%${val}%`;
    case 'starts_with':
      return `${col}.ilike.${val}%`;
    case 'ends_with':
      return `${col}.ilike.%${val}`;
    case 'greater_than':
      return `${col}.gt.${val}`;
    case 'less_than':
      return `${col}.lt.${val}`;
    case 'greater_than_or_equal':
      return `${col}.gte.${val}`;
    case 'less_than_or_equal':
      return `${col}.lte.${val}`;
    case 'between':
      return `and(${col}.gte.${val},${col}.lte.${val2})`;
    case 'in_list': {
      const list = (condition.valueList || []).join(',');
      return `${col}.in.(${list})`;
    }
    case 'is_blank':
      return `${col}.is.null`;
    case 'is_not_blank':
      return `${col}.not.is.null`;
    default:
      return `${col}.ilike.%${val}%`;
  }
}

// ---------------------------------------------------------------------------
// Sorting helper
// ---------------------------------------------------------------------------

function applySortToQuery(query, sortField, sortDirection) {
  if (!sortField || !sortDirection) return query;

  const col = `data->>${sortField}`;
  return query.order(col, { ascending: sortDirection === 'asc', nullsFirst: false });
}

// ---------------------------------------------------------------------------
// Base query builder
// ---------------------------------------------------------------------------

function buildBaseQuery(
  selectExpr,
  storeIds,
  organizationId,
  userId,
  filterConfig,
  signal,
  options = {}
) {
  let query = supabase.from('shopify_products').select(selectExpr, options);

  query = query.in('store_id', storeIds);

  if (organizationId) query = query.eq('organization_id', organizationId);
  else query = query.eq('user_id', userId);

  if (signal) query = query.abortSignal(signal);

  query = applyFiltersToQuery(query, filterConfig);
  return query;
}

// ---------------------------------------------------------------------------
// ✅ NEW: RPC detection helper
// ---------------------------------------------------------------------------

function isMissingRpcError(err) {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('function') && (msg.includes('does not exist') || msg.includes('not found'));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a single page of products.
 *
 * ✅ PERFORMANCE:
 * - DO NOT select '*' (it can pull huge JSON / unused columns)
 * - Select only what the UI uses (store_id + data + ids)
 */
export async function queryProductsPage({
  userId,
  storeIds,
  organizationId,
  filterConfig,
  sortField,
  sortDirection,
  pageIndex = 0,
  pageSize = 25,
  signal,
}) {
  await ensureValidSession();

  const from = pageIndex * pageSize;
  const to = from + pageSize - 1;

  // Count query
  const countQuery = buildBaseQuery(
    'id',
    storeIds,
    organizationId,
    userId,
    filterConfig,
    signal,
    { count: 'exact', head: true }
  );

  // ✅ Data query: select only required columns
  let dataQuery = buildBaseQuery(
    'id, store_id, organization_id, shopify_product_id, shopify_variant_id, data',
    storeIds,
    organizationId,
    userId,
    filterConfig,
    signal
  );

  dataQuery = applySortToQuery(dataQuery, sortField, sortDirection);
  dataQuery = dataQuery.range(from, to);

  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

  if (countResult.error) throw countResult.error;
  if (dataResult.error) throw dataResult.error;

  const totalCount = countResult.count ?? 0;
  const pageCount = Math.ceil(totalCount / pageSize);

  const products = formatRows(dataResult.data || []);
  return { data: products, totalCount, pageCount };
}

/**
 * Get aggregate stats for ALL products matching the current filters.
 *
 * ✅ PERFORMANCE:
 * - Try RPC first (fast)
 * - Fallback to existing JS aggregation (keeps compatibility)
 */
export async function queryProductStats({
  userId,
  storeIds,
  organizationId,
  filterConfig,
  signal,
}) {
  await ensureValidSession();

  // ✅ RPC path (fast) - only works if you created the SQL function
  if (organizationId) {
    try {
      const { data, error } = await supabase.rpc('get_product_stats', {
        p_organization_id: organizationId,
        p_store_ids: storeIds,
        p_filter_config: filterConfig,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        return {
          totalProducts: Number(row.total_products || 0),
          totalStores: Number(row.total_stores || 0),
          totalVendors: Number(row.total_vendors || 0),
          totalTypes: Number(row.total_types || 0),
          avgPrice: Number(row.avg_price || 0),
        };
      }
    } catch (err) {
      if (!isMissingRpcError(err)) {
        console.warn('[queryProductStats] RPC failed, using fallback:', err?.message || err);
      }
    }
  }

  // ✅ Fallback (your original)
  let query = buildBaseQuery(
    'store_id, data',
    storeIds,
    organizationId,
    userId,
    filterConfig,
    signal,
    { count: 'exact' }
  );

  const { data, count, error } = await query;

  if (error) {
    if (error.message?.includes('abort') || error.message?.includes('AbortError')) {
      return { totalProducts: 0, totalStores: 0, totalVendors: 0, totalTypes: 0, avgPrice: 0 };
    }
    throw error;
  }

  const rows = data || [];
  const vendors = new Set();
  const types = new Set();
  const storeSet = new Set();
  let priceSum = 0;
  let priceCount = 0;

  for (const row of rows) {
    const d = row.data || {};
    if (d.vendor) vendors.add(d.vendor);
    if (d.productType) types.add(d.productType);
    storeSet.add(row.store_id);

    const price = parseFloat(d.variantPrice || d.price || '0');
    if (!isNaN(price) && price > 0) {
      priceSum += price;
      priceCount += 1;
    }
  }

  return {
    totalProducts: count ?? rows.length,
    totalStores: storeSet.size,
    totalVendors: vendors.size,
    totalTypes: types.size,
    avgPrice: priceCount > 0 ? priceSum / priceCount : 0,
  };
}

/**
 * Fetch ALL products matching the filters (no pagination).
 *
 * ✅ PERFORMANCE:
 * - Avoid selecting '*' in export batches too
 */
export async function queryAllFilteredProducts({
  userId,
  storeIds,
  organizationId,
  filterConfig,
  sortField,
  sortDirection,
  signal,
}) {
  await ensureValidSession();

  const countQuery = buildBaseQuery(
    'id',
    storeIds,
    organizationId,
    userId,
    filterConfig,
    signal,
    { count: 'exact', head: true }
  );

  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  const total = count || 0;
  if (total === 0) return [];

  const batchSize = 1000;
  const totalBatches = Math.ceil(total / batchSize);
  const maxConcurrent = 5;
  const allProducts = [];

  for (let groupStart = 0; groupStart < totalBatches; groupStart += maxConcurrent) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const groupEnd = Math.min(groupStart + maxConcurrent, totalBatches);
    const batchPromises = [];

    for (let i = groupStart; i < groupEnd; i++) {
      const from = i * batchSize;
      const to = from + batchSize - 1;

      const fetchBatch = async () => {
        let q = buildBaseQuery(
          'id, store_id, organization_id, shopify_product_id, shopify_variant_id, data',
          storeIds,
          organizationId,
          userId,
          filterConfig,
          signal
        );
        q = applySortToQuery(q, sortField, sortDirection);
        q = q.range(from, to);

        const { data, error } = await q;
        if (error) throw error;
        return formatRows(data || []);
      };

      batchPromises.push(fetchBatch());
    }

    const results = await Promise.all(batchPromises);
    for (const batch of results) allProducts.push(...batch);
  }

  console.log(`[queryAllFilteredProducts] Fetched ${allProducts.length} products for export`);
  return allProducts;
}

// ---------------------------------------------------------------------------
// Row formatter
// ---------------------------------------------------------------------------

function formatRows(rows) {
  return rows.map((row) => {
    const d = row.data || {};
    return {
      ...d,
      id: row.id || d.id,
      store_id: row.store_id,
      shopify_product_id: row.shopify_product_id,
      shopify_variant_id: row.shopify_variant_id,
      status: d.status || 'UNKNOWN',
      variantPrice: d.variantPrice || d.price,
      price: row.price,
      variants: [],
    };
  });
}
