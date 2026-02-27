import { useState, useMemo, useEffect, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  detectProductFields,
  getNestedValue,
  formatColumnValue,
} from "@/lib/columnDetection";
import { useColumnPreferences } from "@/stores/columnPreferences";
import { ColumnSelector } from "./ColumnSelector";
import FilterBuilder from "./FilterBuilder.jsx";
import { applyFilters } from "@/lib/filterEvaluation";

/**
 * ProductsTable – supports two modes:
 *
 * 1. **Server-side** (default on Dashboard): parent provides `products`
 *    (one page), `totalCount`, pagination / sort / filter callbacks.
 * 2. **Client-side** (reports): pass `initialProducts` – the component
 *    handles filtering, sorting & pagination internally.
 */
function MobileProductList({ products, pageIndex, pageSize }) {
  return (
    <div className="space-y-3 p-2">
      {products.map((product, idx) => {
        const key = product.id || product.shopify_product_id || idx;
        const price = String(
          getNestedValue(product, "variantPrice") || getNestedValue(product, "price") || "—",
        );
        return (
          <div key={key} className="bg-card border rounded p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{product.title || product.name || 'Untitled'}</div>
                <div className="text-xs text-muted-foreground truncate">{product.handle || product.shopify_handle || ''}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">{product.vendor || 'N/A'}</Badge>
                  {product.productType && (
                    <Badge variant="outline" className="text-xs">{product.productType}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">SKU: {product.sku || (product.variantData && product.variantData.sku) || '—'}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-medium">{price}</div>
                <div className="text-xs text-muted-foreground">{product.storeName || ''}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProductsTable({
  // --- Server-side mode props (from Index.jsx) ---
  products: pageProducts,
  totalCount: externalTotalCount,
  isLoadingPage = false,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onFilterApply,
  pageIndex: externalPageIndex,
  pageSize: externalPageSize,
  sortField: externalSortField,
  sortDirection: externalSortDirection,
  appliedFilterConfig,

  // --- Client-side mode props (from report pages) ---
  initialProducts,
  initialFilterConfig,
  onFilterConfigChange,

  // --- Shared props ---
  onColumnsChange,
  showStoreColumn = false,
  visibleColumns,
  reportMode = false,
}) {
  // Detect mode: if initialProducts is supplied, use client-side mode
  const isClientSide = !!initialProducts;

  // ---------- Client-side internal state ----------
  const [csPageIndex, setCsPageIndex] = useState(0);
  const [csPageSize, setCsPageSize] = useState(25);
  const [csSortField, setCsSortField] = useState(null);
  const [csSortDirection, setCsSortDirection] = useState(null);
  const [csFilterConfig, setCsFilterConfig] = useState(
    initialFilterConfig || { items: [] },
  );

  // Unified accessors
  const pageIndex = isClientSide ? csPageIndex : (externalPageIndex ?? 0);
  const pageSize = isClientSide ? csPageSize : (externalPageSize ?? 25);
  const sortField = isClientSide ? csSortField : externalSortField;
  const sortDirection = isClientSide ? csSortDirection : externalSortDirection;
  const filterConfig = isClientSide
    ? csFilterConfig
    : appliedFilterConfig || { items: [] };

  // Client-side: apply filters → sort → paginate
  const csAllProducts = initialProducts || [];

  const csFiltered = useMemo(() => {
    if (!isClientSide) return [];
    return applyFilters(csAllProducts, csFilterConfig);
  }, [isClientSide, csAllProducts, csFilterConfig]);

  const csSorted = useMemo(() => {
    if (!isClientSide || !csSortField) return csFiltered;
    return [...csFiltered].sort((a, b) => {
      const aVal = getNestedValue(a, csSortField);
      const bVal = getNestedValue(b, csSortField);
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      let cmp = 0;
      if (typeof aVal === "string")
        cmp = aVal.toLowerCase().localeCompare(String(bVal).toLowerCase());
      else cmp = Number(aVal) - Number(bVal);
      return csSortDirection === "desc" ? -cmp : cmp;
    });
  }, [isClientSide, csFiltered, csSortField, csSortDirection]);

  const csTotalCount = isClientSide ? csSorted.length : 0;

  const csPageProducts = useMemo(() => {
    if (!isClientSide) return [];
    const start = csPageIndex * csPageSize;
    return csSorted.slice(start, start + csPageSize);
  }, [isClientSide, csSorted, csPageIndex, csPageSize]);

  // The products to render + total count
  const products = isClientSide ? csPageProducts : pageProducts || [];
  const totalCount = isClientSide ? csTotalCount : (externalTotalCount ?? 0);
  const [showFilters, setShowFilters] = useState(false);

  // Column resizing state
  const [columnWidths, setColumnWidths] = useState({});
  const resizingColumnRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Column resize handlers
  const handleResizeStart = (columnKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColumnRef.current = columnKey;
    startXRef.current = e.clientX;
    const headerElement = e.target.closest("th");
    startWidthRef.current = headerElement?.offsetWidth || 150;
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  const handleResizeMove = (e) => {
    if (!resizingColumnRef.current) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(80, startWidthRef.current + diff);
    setColumnWidths((prev) => ({
      ...prev,
      [resizingColumnRef.current]: newWidth,
    }));
  };

  const handleResizeEnd = () => {
    resizingColumnRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, []);

  const { preferences, initializePreferences } = useColumnPreferences();

  // Detect columns – in client-side mode use full dataset, else current page
  const columnSource = isClientSide ? csAllProducts : products;
  const allColumns = useMemo(() => {
    if (columnSource.length === 0) return [];
    const detected = detectProductFields(columnSource);
    if (showStoreColumn && !detected.some((c) => c.key === "storeName")) {
      detected.push({
        key: "storeName",
        label: "Store",
        type: "string",
        sortable: true,
        filterable: true,
      });
    }
    return detected.filter((col) => !col.hidden);
  }, [columnSource, showStoreColumn]);

  useEffect(() => {
    if (allColumns.length > 0) initializePreferences(allColumns);
  }, [allColumns, initializePreferences]);

  // Visible / ordered columns
  const columns = useMemo(() => {
    const prefMap = preferences instanceof Map ? preferences : new Map();
    return allColumns
      .filter((col) => {
        if (reportMode && visibleColumns)
          return visibleColumns.includes(col.key);
        const pref = prefMap.get(col.key);
        return pref?.visible ?? true;
      })
      .sort((a, b) => {
        if (reportMode && visibleColumns)
          return visibleColumns.indexOf(a.key) - visibleColumns.indexOf(b.key);
        const prefA = prefMap.get(a.key);
        const prefB = prefMap.get(b.key);
        return (prefA?.order ?? Infinity) - (prefB?.order ?? Infinity);
      });
  }, [allColumns, preferences, reportMode, visibleColumns]);

  useEffect(() => {
    onColumnsChange?.(columns);
  }, [columns, onColumnsChange]);

  // Pagination derived values
  const pageCount = Math.ceil(totalCount / pageSize);

  // Sort handler – delegates to parent or updates local state
  const handleSort = (field) => {
    let newField = field;
    let newDir = "asc";

    if (sortField === field) {
      if (sortDirection === "asc") {
        newDir = "desc";
      } else {
        newField = null;
        newDir = null;
      }
    }
    if (isClientSide) {
      setCsSortField(newField);
      setCsSortDirection(newDir);
      setCsPageIndex(0);
    } else {
      onSortChange?.(newField, newDir);
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field)
      return (
        <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" />
      );
    if (sortDirection === "asc")
      return <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" />;
    return <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />;
  };

  const activeFilterCount = (filterConfig?.items ?? []).filter(
    (item) => typeof item === "object" && "id" in item,
  ).length;

  // Mobile detection for compact list rendering
  const [isMobile, setIsMobile] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.innerWidth < 640;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Cell renderer
  const renderCellContent = (product, column) => {
    const value = getNestedValue(product, column.key);

    if (column.key === "images" || column.type === "image") {
      return (
        <div className="w-10 h-10 rounded-md overflow-hidden bg-muted flex items-center justify-center">
          {product.images?.edges?.[0]?.node?.url ? (
            <img
              src={product.images.edges[0].node.url}
              alt={product.images.edges[0].node.altText || product.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs text-muted-foreground">N/A</span>
          )}
        </div>
      );
    }

    if (column.key === "title") {
      return (
        <div className="space-y-0.5">
          <p className="font-medium truncate max-w-[250px]">{product.title}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[250px]">
            {product.handle}
          </p>
        </div>
      );
    }

    if (column.type === "currency")
      return formatColumnValue(
        value,
        "currency",
        product.priceRange?.minVariantPrice?.currencyCode || "USD",
      );
    if (column.type === "number") {
      if (column.key === "totalInventory") {
        return (
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
              (value || 0) > 10 && "bg-success/10 text-success",
              (value || 0) <= 10 &&
                (value || 0) > 0 &&
                "bg-warning/10 text-warning",
              (value || 0) === 0 && "bg-muted/50 text-muted-foreground",
            )}
          >
            {value || 0}
          </span>
        );
      }
      return formatColumnValue(value, "number");
    }
    if (column.type === "date") return formatColumnValue(value, "date");
    if (column.type === "string") {
      if (["vendor", "productType", "storeName"].includes(column.key)) {
        return (
          <Badge variant="outline" className="font-normal">
            {value || "N/A"}
          </Badge>
        );
      }
      return value ? (
        <span className="text-sm text-foreground/85">{value}</span>
      ) : (
        "N/A"
      );
    }
    return formatColumnValue(value, column.type);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="glass-card rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Filter toggle */}
          <div className="flex-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              {showFilters ? "Hide Filters" : "Show Filters"}
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </div>

          {!reportMode && <ColumnSelector availableColumns={allColumns} />}

          {/* Page size */}
          <div className="ml-auto">
            <Select
              value={pageSize.toString()}
              disabled={!isClientSide && !onPageSizeChange}
              onValueChange={(v) => {
                const newSize = parseInt(v);
                if (isClientSide) {
                  setCsPageSize(newSize);
                  setCsPageIndex(0);
                } else {
                  onPageSizeChange?.(newSize);
                }
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Items per page" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="25">25 per page</SelectItem>
                  {(isClientSide || onPageSizeChange) && (
                    <>
                      <SelectItem value="50">50 per page</SelectItem>
                      <SelectItem value="100">100 per page</SelectItem>
                    </>
                  )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filter builder (draft-based, with Apply button) */}
        {showFilters && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50">
            <FilterBuilder
              config={filterConfig}
              onApply={(config) => {
                if (isClientSide) {
                  setCsFilterConfig(config);
                  setCsPageIndex(0);
                  onFilterConfigChange?.(config);
                } else {
                  onFilterApply?.(config);
                }
              }}
              availableColumns={allColumns}
            />
          </div>
        )}
      </div>

      {/* Table / Mobile list */}
      <div className="glass-card rounded-lg overflow-hidden relative">
        <div className="overflow-x-auto">
          
            <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[50px]">#</TableHead>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn(
                      column.type === "number" && "text-right",
                      column.type === "currency" && "text-right",
                      "relative group",
                    )}
                    style={{
                      width: columnWidths[column.key]
                        ? `${columnWidths[column.key]}px`
                        : undefined,
                      minWidth: columnWidths[column.key]
                        ? `${columnWidths[column.key]}px`
                        : undefined,
                    }}
                  >
                    {column.sortable ? (
                      <button
                        onClick={() => handleSort(column.key)}
                        className="flex items-center font-medium hover:text-foreground transition-colors w-full"
                      >
                        {column.label} <SortIcon field={column.key} />
                      </button>
                    ) : (
                      <span className="font-medium">{column.label}</span>
                    )}
                    <div
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      onMouseDown={(e) => handleResizeStart(column.key, e)}
                      style={{ userSelect: "none" }}
                    >
                      <div className="w-0.5 h-4 bg-primary/70" />
                    </div>
                  </TableHead>
                ))}
                {showStoreColumn &&
                  !columns.some((c) => c.key === "storeName") && (
                    <TableHead className="relative group">
                      <button
                        onClick={() => handleSort("storeName")}
                        className="flex items-center font-medium hover:text-foreground transition-colors"
                      >
                        Store <SortIcon field="storeName" />
                      </button>
                      <div
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        onMouseDown={(e) => handleResizeStart("storeName", e)}
                        style={{ userSelect: "none" }}
                      >
                        <div className="w-0.5 h-4 bg-primary/70" />
                      </div>
                    </TableHead>
                  )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 && !isLoadingPage ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + 1}
                    className="text-center py-12 text-muted-foreground"
                  >
                    No products found matching your filters
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product, index) => {
                  const variantId = product.variantId;
                  const productKey = variantId
                    ? `${product.id}-${variantId}-${index}`
                    : `${product.id}-${index}`;
                  return (
                    <TableRow
                      key={productKey}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <TableCell className="text-foreground/70 text-sm font-medium">
                        {pageIndex * pageSize + index + 1}
                      </TableCell>
                      {columns.map((column) => (
                        <TableCell
                          key={`${productKey}-${column.key}`}
                          className={cn(
                            column.type === "number" && "text-right",
                            column.type === "currency" && "text-right",
                            "overflow-hidden",
                          )}
                          style={{
                            width: columnWidths[column.key]
                              ? `${columnWidths[column.key]}px`
                              : undefined,
                            minWidth: columnWidths[column.key]
                              ? `${columnWidths[column.key]}px`
                              : undefined,
                            maxWidth: columnWidths[column.key]
                              ? `${columnWidths[column.key]}px`
                              : undefined,
                            maxHeight: "60px",
                          }}
                        >
                          <div
                            className="truncate max-h-[60px] overflow-hidden"
                            title={String(
                              getNestedValue(product, column.key) || "",
                            )}
                          >
                            {renderCellContent(product, column)}
                          </div>
                        </TableCell>
                      ))}
                      {showStoreColumn &&
                        !columns.some((c) => c.key === "storeName") && (
                          <TableCell>
                            <Badge variant="secondary" className="font-normal">
                              {product.storeName}
                            </Badge>
                          </TableCell>
                        )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="glass-card rounded-lg p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {products.length > 0 ? pageIndex * pageSize + 1 : 0}–
              {pageIndex * pageSize + products.length}
            </span>{" "}
            of <span className="font-medium text-foreground">{totalCount}</span>{" "}
            products
          </div>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (isClientSide) setCsPageIndex(pageIndex - 1);
                  else onPageChange?.(pageIndex - 1);
                }}
                disabled={pageIndex === 0 || isLoadingPage}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-muted-foreground">
                Page {pageIndex + 1} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (isClientSide) setCsPageIndex(pageIndex + 1);
                  else onPageChange?.(pageIndex + 1);
                }}
                disabled={pageIndex >= pageCount - 1 || isLoadingPage}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
