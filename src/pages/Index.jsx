import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useProductsStore } from '@/stores/productsStore';
import { Package, Banknote, Building2, Tags, Store } from 'lucide-react';
import { exportToExcel } from '@/lib/exportToExcel';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ProductsTable } from '@/components/dashboard/ProductsTable';
import { AddStoreDialog } from '@/components/dashboard/AddStoreDialog';
import { StoreSelector } from '@/components/dashboard/StoreSelector';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useStoreManagement } from '@/stores/storeManagement';
import { queryProductsPage, queryProductStats, queryAllFilteredProducts } from '@/lib/serverQueries';
import { syncStoresProductsFull, getOrgLastSyncTime, isOrgSyncDue } from '@/lib/shopifySync';
import { useOrganization } from '@/stores/organizationStore';
import { useAuth } from '@/stores/authStore.jsx';

// Helper function to check if an error is an AbortError
function isAbortError(error) {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return true;
  if (error && typeof error === 'object' && 'message' in error && 
      typeof error.message === 'string' && 
      (error.message.toLowerCase().includes('abort') || error.message.includes('cancelled'))) return true;
  return false;
}

function Index() {
  // --- Column / export state ---
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [isExporting, setIsExporting] = useState(false);

  // --- Server-side pagination / sort / filter state ---
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState(null);
  const [appliedFilterConfig, setAppliedFilterConfig] = useState({ items: [] });

  // --- Data state ---
  const [pageProducts, setPageProducts] = useState([]);   // current page only
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ totalProducts: 0, totalStores: 0, totalVendors: 0, totalTypes: 0, avgPrice: 0 });

  // --- Loading state ---
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [error, setError] = useState(null);

  // Sync metadata (persisted)
  const lastSyncAt = useProductsStore((state) => state.lastSyncAt);
  const setLastSyncAt = useProductsStore((state) => state.setLastSyncAt);

  const abortControllerRef = useRef(null);
  const syncCheckRef = useRef(null);

  const { stores, selectedStoreId, viewMode, loadStores, isLoading: isLoadingStores } = useStoreManagement();
  const activeOrganizationId = useOrganization((state) => state.activeOrganizationId);
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id || null;

  // Stores to query
  const storesToFetch = useMemo(() => {
    if (viewMode === 'combined' && selectedStoreId === null) return stores;
    if (selectedStoreId) {
      const store = stores.find((s) => s.id === selectedStoreId);
      return store ? [store] : [];
    }
    return stores;
  }, [stores, selectedStoreId, viewMode]);

  const storeIds = useMemo(() => storesToFetch.map((s) => s.id), [storesToFetch]);
  const storesKey = useMemo(() => [...storeIds].sort().join(','), [storeIds]);

  // -------------------------------------------------------------------
  // Fetch a page of products + stats from the server
  // -------------------------------------------------------------------
  const fetchPage = useCallback(async (opts = {}) => {
    const {
      page = pageIndex,
      size = pageSize,
      sort = sortField,
      dir = sortDirection,
      filters = appliedFilterConfig,
      showPageLoader = true,
    } = opts;

    if (!userId || storeIds.length === 0) {
      setPageProducts([]);
      setTotalCount(0);
      setIsLoadingPage(false);
      setIsInitialLoading(false);
      return;
    }

    // Abort any in-flight request
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (showPageLoader) setIsLoadingPage(true);
    setError(null);

    try {
      // Fetch page data + stats in parallel
      const [pageResult, statsResult] = await Promise.all([
        queryProductsPage({
          userId,
          storeIds,
          organizationId: activeOrganizationId || undefined,
          filterConfig: filters,
          sortField: sort,
          sortDirection: dir,
          pageIndex: page,
          pageSize: size,
          signal: controller.signal,
        }),
        queryProductStats({
          userId,
          storeIds,
          organizationId: activeOrganizationId || undefined,
          filterConfig: filters,
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted) return;

      // Attach storeName to each product
      const products = pageResult.data.map((p) => ({
        ...p,
        storeName: storesToFetch.find((s) => s.id === p.store_id)?.name || '',
      }));

      setPageProducts(products);
      setTotalCount(pageResult.totalCount);
      setStats(statsResult);
    } catch (err) {
      if (isAbortError(err)) return;
      console.error('[Index] fetchPage error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load products';
      setError(msg);
      toast({ title: 'Error loading products', description: msg, variant: 'destructive' });
    } finally {
      setIsLoadingPage(false);
      setIsInitialLoading(false);
    }
  }, [userId, storeIds, storesToFetch, activeOrganizationId, pageIndex, pageSize, sortField, sortDirection, appliedFilterConfig]);

  // Keep a ref to the latest fetchPage so intervals/visibility handlers use it
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => { fetchPageRef.current = fetchPage; }, [fetchPage]);

  // -------------------------------------------------------------------
  // Sync check + initial load
  // -------------------------------------------------------------------
  const checkSyncAndLoad = useCallback(async (forceSync = false) => {
    if (!userId || storeIds.length === 0) {
      setIsInitialLoading(false);
      return;
    }

    setIsInitialLoading(true);
    try {
      const orgLastSync = await getOrgLastSyncTime(activeOrganizationId, storeIds);
      const shouldSync = forceSync || isOrgSyncDue(orgLastSync);

      if (shouldSync) {
        console.log('[Index] Sync triggered, syncing stores...');
        await syncStoresProductsFull(userId, storesToFetch, activeOrganizationId || undefined);
        setLastSyncAt(new Date().toISOString());
      } else if (orgLastSync) {
        setLastSyncAt(orgLastSync);
      }

      // After sync (or skip), fetch first page
      await fetchPageRef.current({ page: 0, showPageLoader: false });
    } catch (err) {
      if (!isAbortError(err)) {
        console.error('[Index] checkSyncAndLoad error:', err);
        setError(err instanceof Error ? err.message : 'Failed to sync');
      }
      setIsInitialLoading(false);
    }
  }, [userId, storeIds, storesToFetch, activeOrganizationId, setLastSyncAt]);

  // -------------------------------------------------------------------
  // Reload stores on org change
  // -------------------------------------------------------------------
  useEffect(() => {
    if (activeOrganizationId && isAuthenticated) {
      setPageProducts([]);
      setTotalCount(0);
      setIsInitialLoading(true);
      loadStores();
    }
  }, [activeOrganizationId, isAuthenticated, loadStores]);

  // -------------------------------------------------------------------
  // Load first page when stores are ready
  // -------------------------------------------------------------------
  useEffect(() => {
    if (isLoadingStores) return;
    if (storeIds.length > 0) {
      checkSyncAndLoad(false);
    } else {
      setIsInitialLoading(false);
    }
  }, [storesKey, isLoadingStores, checkSyncAndLoad]);

  // -------------------------------------------------------------------
  // Refetch page when pagination / sort / filter changes
  // -------------------------------------------------------------------
  useEffect(() => {
    // Skip the initial render – checkSyncAndLoad handles that
    if (isInitialLoading) return;
    if (storeIds.length === 0) return;
    fetchPage();
  }, [pageIndex, pageSize, sortField, sortDirection, appliedFilterConfig]);

  // -------------------------------------------------------------------
  // 30-minute periodic sync check
  // -------------------------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => {
      console.log('[Index] Periodic sync check');
      // Re-run sync check + reload current page
      if (syncCheckRef.current) syncCheckRef.current(false);
    }, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { syncCheckRef.current = checkSyncAndLoad; }, [checkSyncAndLoad]);

  // -------------------------------------------------------------------
  // Visibility handler – just reset stuck loading
  // -------------------------------------------------------------------
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (pageProducts.length === 0 && storeIds.length > 0 && !isLoadingPage) {
          fetchPageRef.current({});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [pageProducts.length, storeIds.length, isLoadingPage]);

  // -------------------------------------------------------------------
  // Callbacks for ProductsTable
  // -------------------------------------------------------------------
  const handlePageChange = useCallback((newPage) => setPageIndex(newPage), []);
  const handlePageSizeChange = useCallback((newSize) => { setPageSize(newSize); setPageIndex(0); }, []);
  const handleSortChange = useCallback((field, dir) => { setSortField(field); setSortDirection(dir); setPageIndex(0); }, []);
  const handleFilterApply = useCallback((config) => { setAppliedFilterConfig(config); setPageIndex(0); }, []);

  // -------------------------------------------------------------------
  // Export – fetches ALL filtered products from server then exports
  // -------------------------------------------------------------------
  const handleExport = async () => {
    const columnsToExport = selectedColumns.length > 0 ? selectedColumns : [];
    if (columnsToExport.length === 0) {
      toast({ title: 'No columns selected', description: 'Please wait for the table to load columns.', variant: 'destructive' });
      return;
    }

    setIsExporting(true);
    try {
      const allProducts = await queryAllFilteredProducts({
        userId,
        storeIds,
        organizationId: activeOrganizationId || undefined,
        filterConfig: appliedFilterConfig,
        sortField,
        sortDirection,
      });

      if (allProducts.length === 0) {
        toast({ title: 'No products to export', description: 'No products found matching the current filters.', variant: 'destructive' });
        setIsExporting(false);
        return;
      }

      // Attach storeName
      const withNames = allProducts.map((p) => ({
        ...p,
        storeName: storesToFetch.find((s) => s.id === p.store_id)?.name || '',
      }));

      exportToExcel(withNames, columnsToExport, 'shopify-products');
      toast({
        title: 'Export successful',
        description: `Exported ${withNames.length} products${appliedFilterConfig.items.length > 0 ? ' matching your filters' : ''} to Excel.`,
      });
    } catch (err) {
      console.error('[handleExport] Error:', err);
      toast({ title: 'Export failed', description: err instanceof Error ? err.message : 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  // -------------------------------------------------------------------
  // Format helpers
  // -------------------------------------------------------------------
  const formatCurrency = (value, currency) => {
    return new Intl.NumberFormat('en-LK', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background w-full">
      <div className="w-full px-2 sm:px-3 lg:max-w-7xl lg:mx-auto lg:px-6 xl:px-8 py-3 sm:py-4 lg:py-8">
        <div className="w-full space-y-3 sm:space-y-4 lg:space-y-8 animate-fade-in">
          {/* Header */}
          <DashboardHeader
            onExport={handleExport}
            onRefresh={() => checkSyncAndLoad(true)}
            isLoading={isInitialLoading}
            isExporting={isExporting}
            productCount={stats.totalProducts}
            lastSyncAt={lastSyncAt}
          />

          {/* Store Management Bar */}
          <div className="glass-card rounded-lg p-2 sm:p-4 w-full">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center justify-between">
              <StoreSelector />
              <AddStoreDialog />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 w-full">
            {isInitialLoading ? (
              [...Array(5)].map((_, i) => <Skeleton key={i} className="h-[80px] sm:h-[120px] rounded-lg w-full" />)
            ) : (
              <>
                <StatsCard title="Total Products" value={stats.totalProducts} subtitle="Across stores" icon={<Package className="h-5 w-5 text-primary" />} className="w-full" />
                <StatsCard title="Connected Stores" value={stats.totalStores} subtitle="Active" icon={<Store className="h-5 w-5 text-primary" />} className="w-full" />
                <StatsCard title="Unique Vendors" value={stats.totalVendors} subtitle="Product suppliers" icon={<Building2 className="h-5 w-5 text-primary" />} className="w-full" />
                <StatsCard title="Product Types" value={stats.totalTypes} subtitle="Categories" icon={<Tags className="h-5 w-5 text-primary" />} className="w-full" />
                <StatsCard title="Average Price" value={formatCurrency(stats.avgPrice, 'LKR')} subtitle="Across all products" icon={<Banknote className="h-5 w-5 text-primary" />} className="w-full" />
              </>
            )}
          </div>

          {/* Products Table */}
          <div className="space-y-4">
            {isInitialLoading ? (
              <>
                <Skeleton className="h-[60px] rounded-lg w-full" />
                <Skeleton className="h-[400px] sm:h-[450px] md:h-[500px] rounded-lg w-full" />
              </>
            ) : error ? (
              <div className="glass-card rounded-lg p-12 text-center">
                <p className="text-destructive font-medium mb-2">Failed to load products</p>
                <p className="text-muted-foreground text-sm mb-4">{error}</p>
                <button onClick={() => fetchPage()} className="text-primary hover:underline text-sm font-medium">Try again</button>
              </div>
            ) : stores.length === 0 ? (
              <div className="glass-card rounded-lg p-12 text-center">
                <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="font-medium mb-2">No stores connected</p>
                <p className="text-muted-foreground text-sm mb-4">Add a Shopify store to start viewing product data.</p>
                <AddStoreDialog />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg">
                <ProductsTable
                  products={pageProducts}
                  totalCount={totalCount}
                  isLoadingPage={isLoadingPage}
                  pageIndex={pageIndex}
                  pageSize={pageSize}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  appliedFilterConfig={appliedFilterConfig}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                  onSortChange={handleSortChange}
                  onFilterApply={handleFilterApply}
                  onColumnsChange={setSelectedColumns}
                  showStoreColumn={storesToFetch.length > 1}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Index;