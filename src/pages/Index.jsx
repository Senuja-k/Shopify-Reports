import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useProductsStore } from "@/stores/productsStore";
import { Package, Banknote, Building2, Tags, Store } from "lucide-react";
import { exportToExcel } from "@/lib/exportToExcel";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ProductsTable } from "@/components/dashboard/ProductsTable";
import { AddStoreDialog } from "@/components/dashboard/AddStoreDialog";
import { StoreSelector } from "@/components/dashboard/StoreSelector";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useStoreManagement } from "@/stores/storeManagement";
import {
  queryProductsPage,
  queryProductStats,
  queryAllFilteredProducts,
} from "@/lib/serverQueries";
import {
  syncStoresProductsFull,
  getOrgLastSyncTime,
  isOrgSyncDue,
} from "@/lib/shopifySync";
import { useOrganization } from "@/stores/organizationStore";
import { useAuth } from "@/stores/authStore.jsx";
import { useLocation } from "react-router-dom";
import { useProductsPageCacheStore } from "@/stores/productsPageCacheStore";

// Helper function to check if an error is an AbortError
function isAbortError(error) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError"
  )
    return true;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    (error.message.toLowerCase().includes("abort") ||
      error.message.includes("cancelled"))
  )
    return true;
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
  const [pageProducts, setPageProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalStores: 0,
    totalVendors: 0,
    totalTypes: 0,
    avgPrice: 0,
  });

  // --- Loading state ---
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [error, setError] = useState(null);

  // Sync metadata (persisted)
  const lastSyncAt = useProductsStore((state) => state.lastSyncAt);
  const setLastSyncAt = useProductsStore((state) => state.setLastSyncAt);

  // ✅ NEW: background sync indicator for header
  const [isSyncing, setIsSyncing] = useState(false);

  // Refs
  const abortControllerRef = useRef(null);
  const syncCheckRef = useRef(null);
  const lastRouteEnterRef = useRef(Date.now());

  // ✅ NEW: prevent double refresh spam on tab return
  const returnDebounceRef = useRef(0);
  const tabRefreshInFlightRef = useRef(false);

  // ✅ NEW: freshness tracking to avoid unnecessary work
  const lastDataFetchAtRef = useRef(0);
  const lastStatsFetchAtRef = useRef(0);
  const DATA_STALE_MS = 15 * 1000; // 15s
  const STATS_STALE_MS = 60 * 1000; // 60s

  const location = useLocation();

  const {
    stores,
    selectedStoreId,
    viewMode,
    isLoading: isLoadingStores,
    error: storesError, // optional
  } = useStoreManagement();

  const activeOrganizationId = useOrganization(
    (state) => state.activeOrganizationId,
  );
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id || null;

  // Cache store (instant restore after reload/back)
  const cache = useProductsPageCacheStore();

  // Stores to query
  const storesToFetch = useMemo(() => {
    if (viewMode === "combined" && selectedStoreId === null) return stores;
    if (selectedStoreId) {
      const store = stores.find((s) => s.id === selectedStoreId);
      return store ? [store] : [];
    }
    return stores;
  }, [stores, selectedStoreId, viewMode]);

  const storeIds = useMemo(
    () => storesToFetch.map((s) => s.id),
    [storesToFetch],
  );
  const storesKey = useMemo(() => [...storeIds].sort().join(","), [storeIds]);

  // Cache key for instant restore
  const currentCacheKey = useMemo(() => {
    return JSON.stringify({
      org: activeOrganizationId || null,
      storeIds: [...storeIds].sort(),
      filter: appliedFilterConfig,
      sortField,
      sortDirection,
      pageIndex,
      pageSize,
    });
  }, [
    activeOrganizationId,
    storeIds,
    appliedFilterConfig,
    sortField,
    sortDirection,
    pageIndex,
    pageSize,
  ]);

  // ✅ Instant paint from cache on reload/back
  useEffect(() => {
    if (cache.cacheKey === currentCacheKey && cache.pageProducts?.length > 0) {
      setPageProducts(cache.pageProducts);
      setTotalCount(cache.totalCount || 0);
      setStats(cache.stats || stats);
      setIsInitialLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache.cacheKey, currentCacheKey]);

  // -------------------------------------------------------------------
  // Fetch a page of products + (optional) stats
  // -------------------------------------------------------------------
  const fetchPage = useCallback(
    async (opts = {}) => {
      const {
        page = pageIndex,
        size = pageSize,
        sort = sortField,
        dir = sortDirection,
        filters = appliedFilterConfig,
        showPageLoader = true,
        includeStats = true, // ✅ NEW
        storeIdsOverride,
        storesToFetchOverride,
      } = opts;

      const effectiveStoreIds = storeIdsOverride ?? storeIds;
      const effectiveStoresToFetch = storesToFetchOverride ?? storesToFetch;

      if (!userId) {
        setIsInitialLoading(false);
        return;
      }

      // ✅ IMPORTANT: do NOT blank UI if storeIds temporarily empty
      if (!effectiveStoreIds || effectiveStoreIds.length === 0) {
        return;
      }

      // Abort any in-flight request
      if (abortControllerRef.current) abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (showPageLoader) setIsLoadingPage(true);
      setError(null);

      try {
        const promises = [
          queryProductsPage({
            userId,
            storeIds: effectiveStoreIds,
            organizationId: activeOrganizationId || undefined,
            filterConfig: filters,
            sortField: sort,
            sortDirection: dir,
            pageIndex: page,
            pageSize: size,
            signal: controller.signal,
          }),
        ];

        if (includeStats) {
          promises.push(
            queryProductStats({
              userId,
              storeIds: effectiveStoreIds,
              organizationId: activeOrganizationId || undefined,
              filterConfig: filters,
              signal: controller.signal,
            }),
          );
        }

        const results = await Promise.all(promises);
        const pageResult = results[0];
        const statsResult = includeStats ? results[1] : null;

        if (controller.signal.aborted) return;

        const products = pageResult.data.map((p) => ({
          ...p,
          storeName:
            effectiveStoresToFetch.find((s) => s.id === p.store_id)?.name || "",
        }));

        setPageProducts(products);
        setTotalCount(pageResult.totalCount);
        lastDataFetchAtRef.current = Date.now();

        if (includeStats && statsResult) {
          setStats(statsResult);
          lastStatsFetchAtRef.current = Date.now();
        }

        // Save to cache (instant next load)
        cache.setCache({
          cacheKey: currentCacheKey,
          pageProducts: products,
          totalCount: pageResult.totalCount,
          stats: includeStats && statsResult ? statsResult : cache.stats,
        });
      } catch (err) {
        if (isAbortError(err)) return;
        console.error("[Index] fetchPage error:", err);
        const msg =
          err instanceof Error ? err.message : "Failed to load products";
        setError(msg);
        toast({
          title: "Error loading products",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setIsLoadingPage(false);
        setIsInitialLoading(false);
      }
    },
    [
      userId,
      storeIds,
      storesToFetch,
      activeOrganizationId,
      pageIndex,
      pageSize,
      sortField,
      sortDirection,
      appliedFilterConfig,
      cache,
      currentCacheKey,
    ],
  );

  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  // -------------------------------------------------------------------
  // Ensure stores are loaded, then fetch using latest store state
  // -------------------------------------------------------------------
  const ensureStoresThenFetch = useCallback(
    async ({ includeStats = true, forceReloadStores = false } = {}) => {
      if (!isAuthenticated || !userId) return;

      const sm = useStoreManagement.getState();

      if ((forceReloadStores || sm.stores.length === 0) && !sm.isLoading) {
        try {
          await sm.loadStores({
            organizationId: activeOrganizationId ?? undefined,
            force: true,
          });
        } catch (e) {
          console.error("[Index] ensureStoresThenFetch loadStores failed:", e);
        }
      }

      const latestStores = useStoreManagement.getState().stores || [];
      const latestSelectedStoreId =
        useStoreManagement.getState().selectedStoreId;
      const latestViewMode = useStoreManagement.getState().viewMode;

      const latestStoresToFetch = (() => {
        if (latestViewMode === "combined" && latestSelectedStoreId === null)
          return latestStores;
        if (latestSelectedStoreId) {
          const st = latestStores.find((s) => s.id === latestSelectedStoreId);
          return st ? [st] : [];
        }
        return latestStores;
      })();

      const latestStoreIds = latestStoresToFetch.map((s) => s.id);
      if (latestStoreIds.length === 0) return;

      await fetchPageRef.current({
        showPageLoader: false,
        includeStats,
        storeIdsOverride: latestStoreIds,
        storesToFetchOverride: latestStoresToFetch,
      });
    },
    [isAuthenticated, userId, activeOrganizationId],
  );

  // Route enter refresh
  useEffect(() => {
    lastRouteEnterRef.current = Date.now();
    ensureStoresThenFetch({ includeStats: true });
  }, [location.pathname, ensureStoresThenFetch]);

  // -------------------------------------------------------------------
  // ✅ Non-blocking sync: show products first, sync in background
  // -------------------------------------------------------------------
  const checkSyncAndLoad = useCallback(
    async (forceSync = false) => {
      if (!userId || storeIds.length === 0) {
        setIsInitialLoading(false);
        return;
      }

      setIsInitialLoading(true);

      try {
        // Show products immediately
        await fetchPageRef.current({
          page: typeof pageIndex === "number" ? pageIndex : 0,
          showPageLoader: false,
          includeStats: true,
        });

        const orgLastSync = await getOrgLastSyncTime(
          activeOrganizationId,
          storeIds,
        );
        const shouldSync = forceSync || isOrgSyncDue(orgLastSync);

        if (orgLastSync) setLastSyncAt(orgLastSync);

        if (shouldSync) {
          setIsSyncing(true);
          syncStoresProductsFull(
            userId,
            storesToFetch,
            activeOrganizationId || undefined,
          )
            .then(() => {
              setLastSyncAt(new Date().toISOString());
              return fetchPageRef.current({
                page: pageIndex,
                showPageLoader: false,
                includeStats: true,
              });
            })
            .catch((e) => {
              console.error("[Index] Background sync failed:", e);
              toast({
                title: "Sync failed",
                description:
                  e instanceof Error ? e.message : "Could not sync stores.",
                variant: "destructive",
              });
            })
            .finally(() => setIsSyncing(false));
        }
      } catch (err) {
        if (!isAbortError(err)) {
          console.error("[Index] checkSyncAndLoad error:", err);
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        setIsInitialLoading(false);
      }
    },
    [
      userId,
      storeIds,
      storesToFetch,
      activeOrganizationId,
      setLastSyncAt,
      pageIndex,
    ],
  );

  // When stores are ready, do initial load/sync check
  useEffect(() => {
    if (isLoadingStores) return;
    if (storeIds.length > 0) {
      checkSyncAndLoad(false);
    } else {
      // don't blank UI
      setIsInitialLoading(false);
    }
  }, [storesKey, isLoadingStores, checkSyncAndLoad]);

  // Refetch on pagination / sort / filter changes
  useEffect(() => {
    if (isInitialLoading) return;
    if (storeIds.length === 0) return;
    fetchPage({ includeStats: true });
  }, [pageIndex, pageSize, sortField, sortDirection, appliedFilterConfig]);

  // 30-minute periodic sync check
  useEffect(() => {
    const id = setInterval(
      () => {
        if (syncCheckRef.current) syncCheckRef.current(false);
      },
      30 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    syncCheckRef.current = checkSyncAndLoad;
  }, [checkSyncAndLoad]);

  // ✅ Tab return handler (stable + no blank UI + avoids heavy stats every time)
  useEffect(() => {
    const onReturn = async () => {
      if (document.visibilityState && document.visibilityState !== "visible")
        return;

      // ✅ If we already have data, DO NOTHING on tab switch
      // (prevents table + stats from reloading)
      if (pageProducts.length > 0 && stats.totalProducts > 0) return;

      // If data is missing (rare), do a light fetch
      await ensureStoresThenFetch({ includeStats: false });

      // If stats are still missing, fetch them in background
      if (stats.totalProducts === 0) {
        setTimeout(() => {
          fetchPageRef.current({ showPageLoader: false, includeStats: true });
        }, 250);
      }
    };

    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, [ensureStoresThenFetch, pageProducts.length, stats.totalProducts]);

  // Table callbacks
  const handlePageChange = useCallback((newPage) => setPageIndex(newPage), []);
  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(newSize);
    setPageIndex(0);
  }, []);
  const handleSortChange = useCallback((field, dir) => {
    setSortField(field);
    setSortDirection(dir);
    setPageIndex(0);
  }, []);
  const handleFilterApply = useCallback((config) => {
    setAppliedFilterConfig(config);
    setPageIndex(0);
  }, []);

  // Export
  const handleExport = async () => {
    const columnsToExport = selectedColumns.length > 0 ? selectedColumns : [];
    if (columnsToExport.length === 0) {
      toast({
        title: "No columns selected",
        description: "Please wait for the table to load columns.",
        variant: "destructive",
      });
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
        toast({
          title: "No products to export",
          description: "No products found matching the current filters.",
          variant: "destructive",
        });
        setIsExporting(false);
        return;
      }

      const withNames = allProducts.map((p) => ({
        ...p,
        storeName: storesToFetch.find((s) => s.id === p.store_id)?.name || "",
      }));

      exportToExcel(withNames, columnsToExport, "shopify-products");
      toast({
        title: "Export successful",
        description: `Exported ${withNames.length} products${appliedFilterConfig.items.length > 0 ? " matching your filters" : ""} to Excel.`,
      });
    } catch (err) {
      console.error("[handleExport] Error:", err);
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formatCurrency = (value, currency) => {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  };

  // ✅ Do not show huge skeleton if we already have data
  const showBigSkeleton = isInitialLoading && pageProducts.length === 0;

  const showStoresLoading =
    isAuthenticated && isLoadingStores && pageProducts.length === 0;
  const showNoStores =
    isAuthenticated && !isLoadingStores && stores.length === 0;

  return (
    <div className="min-h-screen bg-background w-full">
      <div className="w-full px-2 sm:px-3 lg:max-w-7xl lg:mx-auto lg:px-6 xl:px-8 py-3 sm:py-4 lg:py-8">
        <div className="w-full space-y-3 sm:space-y-4 lg:space-y-8 animate-fade-in">
          <DashboardHeader
            onExport={handleExport}
            onRefresh={() => checkSyncAndLoad(true)}
            isLoading={showBigSkeleton}
            isSyncing={isSyncing}
            isExporting={isExporting}
            productCount={stats.totalProducts}
            lastSyncAt={lastSyncAt}
          />

          <div className="glass-card rounded-lg p-2 sm:p-4 w-full">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center justify-between">
              <StoreSelector />
              <AddStoreDialog />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 w-full">
            {showBigSkeleton ? (
              [...Array(5)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-[80px] sm:h-[120px] rounded-lg w-full"
                />
              ))
            ) : (
              <>
                <StatsCard
                  title="Total Products"
                  value={stats.totalProducts}
                  subtitle="Across stores"
                  icon={<Package className="h-5 w-5 text-primary" />}
                  className="w-full"
                />
                <StatsCard
                  title="Connected Stores"
                  value={stats.totalStores}
                  subtitle="Active"
                  icon={<Store className="h-5 w-5 text-primary" />}
                  className="w-full"
                />
                <StatsCard
                  title="Unique Vendors"
                  value={stats.totalVendors}
                  subtitle="Product suppliers"
                  icon={<Building2 className="h-5 w-5 text-primary" />}
                  className="w-full"
                />
                <StatsCard
                  title="Product Types"
                  value={stats.totalTypes}
                  subtitle="Categories"
                  icon={<Tags className="h-5 w-5 text-primary" />}
                  className="w-full"
                />
                <StatsCard
                  title="Average Price"
                  value={formatCurrency(stats.avgPrice, "LKR")}
                  subtitle="Across all products"
                  icon={<Banknote className="h-5 w-5 text-primary" />}
                  className="w-full"
                />
              </>
            )}
          </div>

          <div className="space-y-4">
            {showStoresLoading ? (
              <>
                <Skeleton className="h-[60px] rounded-lg w-full" />
                <Skeleton className="h-[400px] sm:h-[450px] md:h-[500px] rounded-lg w-full" />
              </>
            ) : error ? (
              <div className="glass-card rounded-lg p-12 text-center">
                <p className="text-destructive font-medium mb-2">
                  Failed to load products
                </p>
                <p className="text-muted-foreground text-sm mb-4">{error}</p>
                <button
                  onClick={() => fetchPage()}
                  className="text-primary hover:underline text-sm font-medium"
                >
                  Try again
                </button>
              </div>
            ) : showNoStores ? (
              <div className="glass-card rounded-lg p-12 text-center">
                <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="font-medium mb-2">No stores connected</p>
                <p className="text-muted-foreground text-sm mb-4">
                  Add a Shopify store to start viewing product data.
                </p>
                <AddStoreDialog />
                {storesError ? (
                  <p className="text-destructive text-sm mt-4">
                    {String(storesError)}
                  </p>
                ) : null}
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
