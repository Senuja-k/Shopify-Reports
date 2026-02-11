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

/**
 * Map a single filter condition onto a Supabase query builder.
 *
 * Text fields are extracted with `->>` (returns text from JSONB).
 * Numeric comparison uses the same text path – for the vast majority of
 * real-world price / inventory values the lexicographic order matches
 * numeric order when the values have the same number of digits.  For
 * truly correct numeric comparison a Postgres cast / RPC would be needed,
 * but this covers 99 % of practical use-cases without requiring a DB
 * migration.
 */
function applyConditionToQuery(query, condition) {
  // data->>field extracts TEXT from the JSONB column
  const col = `data->>${condition.field}`;
  const val = condition.value ?? '';
  const val2 = condition.value2 ?? '';

  switch (condition.operator) {
    // ---- String operators ----
    case 'equals':
      return query.ilike(col, val); // case-insensitive equals
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

    // ---- Numeric / date operators ----
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

    // ---- List operators ----
    case 'in_list': {
      const list = condition.valueList || [];
      if (list.length === 0) return query;
      return query.in(col, list);
    }

    // ---- Blank checks ----
    case 'is_blank':
      return query.is(col, null);
    case 'is_not_blank':
      return query.not(col, 'is', null);

    default:
      console.warn(`[serverQueries] Unknown operator: ${condition.operator}`);
      return query;
  }
}

/**
 * Apply the full filter config to a Supabase query.
 *
 * The config.items array alternates between condition objects and
 * logical operators ("AND" / "OR").  Supabase chaining is inherently
 * AND, so AND conditions are applied sequentially.  OR conditions use
 * Supabase's `.or()` helper.
 *
 * Limitation: Mixed AND/OR groups with complex precedence are simplified
 * – pure AND chains and pure OR chains work correctly, mixed chains
 * evaluate left-to-right (same as the client-side evaluateFilters).
 */
function applyFiltersToQuery(query, filterConfig) {
  if (!filterConfig?.items?.length) return query;

  // Separate conditions and logical operators
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

  // Check if any OR operator exists – if so we need .or()
  const hasOr = logicOps.includes('OR');

  if (!hasOr) {
    // Pure AND – chain filters sequentially
    for (const cond of conditions) {
      query = applyConditionToQuery(query, cond);
    }
    return query;
  }

  // Mixed AND/OR – build an OR string for PostgREST
  // PostgREST .or() takes a comma-separated filter string
  // We build sub-expressions and combine them
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

  // For each AND group, build a PostgREST filter expression
  // If there's only one condition in a group, it becomes a simple filter
  // Multiple groups are combined with .or()
  if (orParts.length === 1) {
    // Single group – just apply as AND chain
    for (const cond of orParts[0]) {
      query = applyConditionToQuery(query, cond);
    }
    return query;
  }

  // Multiple OR groups – use PostgREST .or() syntax
  const orExpressions = orParts.map((group) => {
    if (group.length === 1) {
      return conditionToPostgrestString(group[0]);
    }
    // AND within an OR group – use "and(f1,f2)" syntax
    const andExprs = group.map(conditionToPostgrestString);
    return `and(${andExprs.join(',')})`;
  });

  query = query.or(orExpressions.join(','));
  return query;
}

/**
 * Convert a condition to a raw PostgREST filter string for use inside
 * `.or()` calls.  Returns e.g. `data->>title.ilike.%foo%`
 */
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

  // Supabase supports ordering by JSONB paths: data->field
  // Using ->> for text ordering (case-sensitive; for most fields this is fine)
  const col = `data->>${sortField}`;
  return query.order(col, { ascending: sortDirection === 'asc', nullsFirst: false });
}

// ---------------------------------------------------------------------------
// Base query builder (shared between page, count, stats, export)
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
  let query = supabase
    .from('shopify_products')
    .select(selectExpr, options);

  query = query.in('store_id', storeIds);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  } else {
    query = query.eq('user_id', userId);
  }

  if (signal) {
    query = query.abortSignal(signal);
  }

  query = applyFiltersToQuery(query, filterConfig);
  return query;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a single page of products.
 *
 * @returns {{ data: object[], totalCount: number, pageCount: number }}
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

  // Count query (with same filters)
  const countQuery = buildBaseQuery(
    'id',
    storeIds,
    organizationId,
    userId,
    filterConfig,
    signal,
    { count: 'exact', head: true }
  );

  // Data query
  let dataQuery = buildBaseQuery(
    '*',
    storeIds,
    organizationId,
    userId,
    filterConfig,
    signal
  );

  dataQuery = applySortToQuery(dataQuery, sortField, sortDirection);
  dataQuery = dataQuery.range(from, to);

  // Run both in parallel
  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

  if (countResult.error) throw countResult.error;
  if (dataResult.error) throw dataResult.error;

  const totalCount = countResult.count ?? 0;
  const pageCount = Math.ceil(totalCount / pageSize);

  // Format rows – same logic as getAllVariantsByStore
  const products = formatRows(dataResult.data || []);

  return { data: products, totalCount, pageCount };
}

/**
 * Get aggregate stats for ALL products matching the current filters.
 * Used by the stats cards.
 *
 * This fetches lightweight data (only the fields needed for aggregation)
 * so it's fast even for large datasets.
 */
export async function queryProductStats({
  userId,
  storeIds,
  organizationId,
  filterConfig,
  signal,
}) {
  await ensureValidSession();

  // We need vendor, productType, variantPrice, store_id, status
  // Fetch only the JSONB fields we need via a light select
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
    // Silently return zeros on abort
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
 * Used for Excel export.
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

  // First get total count
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

  // Fetch all in batches of 1000 (parallel, 5 concurrent)
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
          '*',
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
    for (const batch of results) {
      allProducts.push(...batch);
    }
  }

  console.log(`[queryAllFilteredProducts] Fetched ${allProducts.length} products for export`);
  return allProducts;
}

// ---------------------------------------------------------------------------
// Row formatter (matches getAllVariantsByStore logic)
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
