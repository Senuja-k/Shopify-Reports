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
  queryAllFilteredProducts,
  queryProductStats,
} from "@/lib/serverQueries";
import { refreshSessionSilently } from "@/lib/supabase";
import {
  syncStoresProductsFull
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

function isAuthError(error) {
  const text = String(
    error?.message || error?.details || error?.hint || "",
  ).toLowerCase();
  return (
    text.includes("jwt") ||
    text.includes("token") ||
    text.includes("auth") ||
    text.includes("permission") ||
    text.includes("unauthorized") ||
    text.includes("forbidden")
  );
}

const DASHBOARD_VIEW_STATE_KEY = "dashboard-view-state";

function readDashboardViewState() {
  try {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(DASHBOARD_VIEW_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeDashboardViewState(state) {
  try {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(DASHBOARD_VIEW_STATE_KEY, JSON.stringify(state));
  } catch {}
}

function Index() {
  const savedViewRef = useRef(readDashboardViewState());

  // --- Column / export state ---
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [isExporting, setIsExporting] = useState(false);

  // --- Server-side pagination / sort / filter state ---
  const [pageIndex, setPageIndex] = useState(() => {
    const v = savedViewRef.current?.pageIndex;
    return Number.isInteger(v) && v >= 0 ? v : 0;
  });
  const pageSize = 25;
  const [sortField, setSortField] = useState(
    () => savedViewRef.current?.sortField ?? null,
  );
  const [sortDirection, setSortDirection] = useState(
    () => savedViewRef.current?.sortDirection ?? null,
  );
  const [appliedFilterConfig, setAppliedFilterConfig] = useState(() => {
    const cfg = savedViewRef.current?.appliedFilterConfig;
    if (cfg && typeof cfg === "object" && Array.isArray(cfg.items)) return cfg;
    return { items: [] };
  });

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
  const pageAbortRef = useRef(null);
  const statsAbortRef = useRef(null);
  const pageReqIdRef = useRef(0);
  const pageIndexRef = useRef(0);
  const lastNonEmptyStoreIdsRef = useRef([]);
  const lastNonEmptyStoresRef = useRef([]);
  const initializedContextRef = useRef("");
  const pageLoadingStartedAtRef = useRef(0);
  const wasHiddenRef = useRef(false);

  // ✅ NEW: prevent double refresh spam on tab return
  const returnDebounceRef = useRef(0);
  const tabRefreshInFlightRef = useRef(false);

  // ✅ NEW: freshness tracking to avoid unnecessary work
  const lastDataFetchAtRef = useRef(0);
  const lastStatsFetchAtRef = useRef(0);
  const DATA_STALE_MS = 2 * 60 * 1000;
  const STATS_STALE_MS = 60 * 1000; // 60s
  const PAGE_REQUEST_TIMEOUT_MS = 20000;

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
  useEffect(() => {
    if (storeIds.length > 0) {
      lastNonEmptyStoreIdsRef.current = storeIds;
      lastNonEmptyStoresRef.current = storesToFetch;
    }
  }, [storeIds, storesToFetch]);

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
        includeCount = true,
        totalCountHint = 0,
        storeIdsOverride,
        storesToFetchOverride,
      } = opts;

      const effectiveStoreIds =
        storeIdsOverride ??
        (storeIds.length > 0 ? storeIds : lastNonEmptyStoreIdsRef.current);
      const effectiveStoresToFetch =
        storesToFetchOverride ??
        (storesToFetch.length > 0 ? storesToFetch : lastNonEmptyStoresRef.current);

      if (!userId) return;
      if (!effectiveStoreIds || effectiveStoreIds.length === 0) return;

      const reqId = ++pageReqIdRef.current;
      if (pageAbortRef.current) pageAbortRef.current.abort();
      const controller = new AbortController();
      pageAbortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), PAGE_REQUEST_TIMEOUT_MS);
      if (statsAbortRef.current) statsAbortRef.current.abort();
      const statsController = new AbortController();
      statsAbortRef.current = statsController;

      if (showPageLoader) setIsLoadingPage(true);
      if (showPageLoader) pageLoadingStartedAtRef.current = Date.now();
      setError(null);

      try {
        const runPageQuery = () =>
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
            includeCount,
            totalCountHint,
          });

        let pageResult;
        try {
          pageResult = await runPageQuery();
        } catch (firstErr) {
          if (isAbortError(firstErr)) throw firstErr;
          if (isAuthError(firstErr)) {
            const refreshed = await refreshSessionSilently(8000);
            if (refreshed) {
              pageResult = await runPageQuery();
            } else {
              throw firstErr;
            }
          } else {
            throw firstErr;
          }
        }

        if (controller.signal.aborted) return;
        if (reqId !== pageReqIdRef.current) return; // ✅ ignore stale response

        const products = pageResult.data.map((p) => ({
          ...p,
          storeName:
            effectiveStoresToFetch.find((s) => s.id === p.store_id)?.name || "",
        }));

        setPageProducts(products);
        setTotalCount(pageResult.totalCount);
        setStats((prev) => ({
          ...prev,
          totalProducts: pageResult.totalCount,
          totalStores: new Set(effectiveStoreIds).size,
        }));

        // Fetch full filtered stats for dashboard cards.
        // This is separate from page fetch so table pagination stays lightweight.
        queryProductStats({
          userId,
          storeIds: effectiveStoreIds,
          organizationId: activeOrganizationId || undefined,
          filterConfig: filters,
          signal: statsController.signal,
        })
          .then((statsResult) => {
            if (statsController.signal.aborted) return;
            setStats((prev) => ({
              ...prev,
              totalProducts: pageResult.totalCount,
              totalStores: statsResult.totalStores,
              totalVendors: statsResult.totalVendors,
              totalTypes: statsResult.totalTypes,
              avgPrice: statsResult.avgPrice,
            }));
            lastStatsFetchAtRef.current = Date.now();
          })
          .catch((statsErr) => {
            if (isAbortError(statsErr)) return;
            console.error("[Index] stats fetch failed:", statsErr);
          });

        lastDataFetchAtRef.current = Date.now();
      } catch (err) {
        if (isAbortError(err)) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load products";
        setError(msg);
        toast({
          title: "Error loading products",
          description: msg,
          variant: "destructive",
        });
      } finally {
        clearTimeout(timeoutId);
        if (pageAbortRef.current === controller) {
          pageAbortRef.current = null;
        }
        if (statsAbortRef.current === statsController) {
          statsAbortRef.current = null;
        }
        if (reqId === pageReqIdRef.current) {
          setIsLoadingPage(false);
          setIsInitialLoading(false);
          pageLoadingStartedAtRef.current = 0;
        }
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
    ],
  );

  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);
  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);

  // -------------------------------------------------------------------
  // Ensure stores are loaded, then fetch using latest store state
  // -------------------------------------------------------------------
  const ensureStoresThenFetch = useCallback(async () => {
    if (!isAuthenticated || !userId) return;

    // ✅ If we already have data and it's still fresh, DO NOTHING
    const last = lastDataFetchAtRef.current || 0;
    const isFresh =
      pageProducts.length > 0 && Date.now() - last < DATA_STALE_MS;
    if (isFresh) {
      
      return;
    }

    // ✅ Only load stores if empty (do NOT force every time)
    const sm = useStoreManagement.getState();
    if (sm.stores.length === 0 && !sm.isLoading) {
      try {
        await sm.loadStores({
          organizationId: activeOrganizationId ?? undefined,
          force: true,
        });
      } catch (e) {
        console.error("[Index] ensureStoresThenFetch loadStores failed:", e);
        return; // no stores, can't fetch
      }
    }

    // ✅ Use latest store state
    const latestStores = useStoreManagement.getState().stores || [];
    const latestSelectedStoreId = useStoreManagement.getState().selectedStoreId;
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
      storeIdsOverride: latestStoreIds,
      storesToFetchOverride: latestStoresToFetch,
    });
  }, [
    isAuthenticated,
    userId,
    activeOrganizationId,
    pageProducts.length, // ✅ important so fresh check updates
  ]);

  // -------------------------------------------------------------------
  // Manual refresh/sync entry point
  // -------------------------------------------------------------------
  const checkSyncAndLoad = useCallback(
    async (forceSync = false) => {
      if (!userId || storeIds.length === 0) {
        setIsInitialLoading(false);
        return;
      }

      try {
        if (forceSync) {
          setIsInitialLoading(true);
          setIsSyncing(true);
          syncStoresProductsFull(
            userId,
            storesToFetch,
            activeOrganizationId || undefined,
          )
            .then(() => {
              setLastSyncAt(new Date().toISOString());
              return fetchPageRef.current({
                page: typeof pageIndexRef.current === "number" ? pageIndexRef.current : 0,
                showPageLoader: false,
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
        } else {
          await fetchPageRef.current({
            page: typeof pageIndexRef.current === "number" ? pageIndexRef.current : 0,
            showPageLoader: false,
          });
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
    ],
  );

  // When stores are ready, do initial load/sync check
  useEffect(() => {
    if (isLoadingStores) return;
    if (storeIds.length === 0) {
      // don't blank UI
      setIsInitialLoading(false);
      initializedContextRef.current = "";
      return;
    }

    // Only run initial fetch when user/org/store-context changes.
    const contextKey = `${userId || ""}|${activeOrganizationId || ""}|${storesKey}`;
    if (initializedContextRef.current === contextKey) return;
    initializedContextRef.current = contextKey;

    fetchPageRef.current({
      page: typeof pageIndexRef.current === "number" ? pageIndexRef.current : 0,
      showPageLoader: false,
      includeCount: true,
    });
  }, [storesKey, isLoadingStores, storeIds.length, userId, activeOrganizationId]);

  // Refetch on pagination / sort / filter changes
  useEffect(() => {
    if (storeIds.length === 0) return;
    if (isInitialLoading) return;
    fetchPage({
      includeCount: true,
      totalCountHint: 0,
    });
  }, [
    pageIndex,
    pageSize,
    sortField,
    sortDirection,
    appliedFilterConfig,
    storeIds.length,
    storesKey,
    activeOrganizationId,
    userId,
    isInitialLoading,
    fetchPage,
  ]);

  // Disabled automatic tab-focus refresh to avoid racing with user pagination actions.

  // Add a periodic sync mechanism
  useEffect(() => {
    return () => {};
  }, []);

  useEffect(() => {
    syncCheckRef.current = checkSyncAndLoad;
  }, [checkSyncAndLoad]);

  // Persist current dashboard view so tab-refresh can restore filters/sort/page.
  useEffect(() => {
    writeDashboardViewState({
      pageIndex,
      sortField,
      sortDirection,
      appliedFilterConfig,
    });
  }, [pageIndex, sortField, sortDirection, appliedFilterConfig]);

  // Refresh on tab switch (hidden -> visible) and restore state from sessionStorage.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true;
        writeDashboardViewState({
          pageIndex: pageIndexRef.current,
          sortField,
          sortDirection,
          appliedFilterConfig,
        });
        return;
      }

      if (document.visibilityState === "visible" && wasHiddenRef.current) {
        wasHiddenRef.current = false;
        writeDashboardViewState({
          pageIndex: pageIndexRef.current,
          sortField,
          sortDirection,
          appliedFilterConfig,
        });
        window.location.reload();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sortField, sortDirection, appliedFilterConfig]);

  // Recover from stuck loading after tab sleep/background throttling.
  useEffect(() => {
    const STUCK_LOADING_MS = 15000;

    const recoverIfStuck = () => {
      if (!isLoadingPage) return;
      const startedAt = pageLoadingStartedAtRef.current || 0;
      if (!startedAt) return;
      if (Date.now() - startedAt < STUCK_LOADING_MS) return;

      if (pageAbortRef.current) {
        try {
          pageAbortRef.current.abort();
        } catch {}
        pageAbortRef.current = null;
      }

      setIsLoadingPage(false);
      setIsInitialLoading(false);
      pageLoadingStartedAtRef.current = 0;

      fetchPageRef.current({
        page: typeof pageIndexRef.current === "number" ? pageIndexRef.current : 0,
        showPageLoader: false,
        includeCount: true,
      });
    };

    const intervalId = setInterval(recoverIfStuck, 1500);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") recoverIfStuck();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isLoadingPage]);

  // Table callbacks
  const handlePageChange = useCallback((newPage) => setPageIndex(newPage), []);
  // Dashboard page size is fixed at 25 to keep requests lightweight.
  const handlePageSizeChange = useCallback(() => {}, []);
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
