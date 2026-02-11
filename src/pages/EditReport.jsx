import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReportManagement } from '../stores/reportManagement';
import { useStoreManagement } from '../stores/storeManagement';
import { auth } from '../lib/supabase';
import { getAllVariantsByStore } from '../lib/shopify-sync-utils';
import { flattenProductsWithVariants } from '../lib/flattenVariants';
import { detectProductFields } from '../lib/columnDetection';
import { applyFilters } from '../lib/filterEvaluation';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { ScrollArea } from '../components/ui/scroll-area';
import { useToast } from '../components/ui/use-toast';
import { AlertCircle, Loader2, ArrowLeft, GripVertical } from 'lucide-react';
import { SimpleHeader } from '../components/dashboard/SimpleHeader';
import { ProductsTable } from '../components/dashboard/ProductsTable';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * REPORT EDITOR (Owner/Admin Mode)
 * 
 * This is where report owners/admins configure the MASTER report:
 * - Set columns, filters, sorting, date ranges
 * - Changes ARE saved to the database
 * - Changes DO affect the master report shown to all viewers
 * - This is different from PublicReport (viewer mode) where changes are local only
 * 
 * When saved, the master config is used default/initial state
 * for all viewers accessing the public/shared link.
 */

// Sortable column item component for drag-and-drop
function SortableColumnItem({ 
  id, 
  label, 
  isSelected, 
  onToggle 
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center space-x-2 bg-background border rounded-md p-2 hover:bg-accent/50"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <Checkbox
        id={`col-${id}`}
        checked={isSelected}
        onCheckedChange={onToggle}
      />
      <label
        htmlFor={`col-${id}`}
        className="text-xs font-medium leading-none cursor-pointer flex-1"
      >
        {label}
      </label>
    </div>
  );
}

export function EditReport() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { reports, updateReport } = useReportManagement();
  const { stores } = useStoreManagement();

  const report = reportId ? reports.find((r) => r.id === reportId) : undefined;

  const [reportName, setReportName] = useState('');
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [availableColumns, setAvailableColumns] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [filterConfig, setFilterConfig] = useState({ items: [] });

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for column reordering
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = availableColumns.findIndex((col) => col.key === active.id);
      const newIndex = availableColumns.findIndex((col) => col.key === over.id);

      const newOrder = arrayMove(availableColumns, oldIndex, newIndex);
      setAvailableColumns(newOrder);
      
      // Reorder selected columns to match new order
      const newSelectedOrder = newOrder
        .filter(col => selectedColumns.includes(col.key))
        .map(col => col.key);
      setSelectedColumns(newSelectedOrder);
    }
  };

  // Load report data and products
  const loadReportData = useCallback(async (showRefreshingState = false) => {
    if (!report) {
      setIsLoading(false);
      return;
    }

    if (showRefreshingState) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    try {
        // Set report details
        setReportName(report.name);
        setSelectedColumns(report.selectedColumns);
        setFilterConfig(report.filterConfig || { items: [] });

        // Load products
        const session = await auth.getSession();
        const user = session.data.session?.user;
        if (!user) {
          throw new Error('User not authenticated');
        }

        let allProducts;
        let availableStoreIds = [];
        const organizationId = report.organizationId;

        if (report.storeId === 'all-stores') {
          // Filter out deleted stores
          availableStoreIds = stores.map(s => s.id);
          if (availableStoreIds.length === 0) {
            // All stores deleted
            setProducts([]);
            setAvailableColumns([]);
            setIsLoading(false);
            return;
          }
          allProducts = await getAllVariantsByStore(user.id, availableStoreIds, organizationId);
        } else {
          // Check if the report's store still exists
          const reportStore = stores.find(s => s.id === report.storeId);
          if (!reportStore) {
            // Store deleted - show empty state
            setProducts([]);
            setAvailableColumns([]);
            setIsLoading(false);
            return;
          }
          availableStoreIds = [report.storeId];
          allProducts = await getAllVariantsByStore(user.id, availableStoreIds, organizationId);
        }

        // Format and flatten products
        const formattedProducts = allProducts.map((v) => ({
          ...v,
          id: v.id || v.shopify_product_id,
          title: v.title || '',
          status: v.status || 'UNKNOWN',
          storeId: v.store_id,
          storeName: stores.find(s => s.id === v.store_id)?.name || '',
        }));

        const flattenedProducts = flattenProductsWithVariants(formattedProducts);
        
        setProducts(flattenedProducts);

        // Detect available columns
        const detected = detectProductFields(flattenedProducts);
        setAvailableColumns(detected);
      } catch (error) {
        console.error('Failed to load report data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load report data',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
  }, [report, stores, toast]);

  // Load on mount or when report/stores change
  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  const handleSaveChanges = async () => {
    if (!report || !reportName.trim()) {
      toast({
        title: 'Error',
        description: 'Report name is required',
        variant: 'destructive',
      });
      return;
    }

    if (selectedColumns.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one column',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      await updateReport(report.id, {
        name: reportName,
        selectedColumns,
        filterConfig,
      });

      toast({
        title: 'Report Updated',
        description: 'Your changes have been saved successfully',
      });

      navigate('/custom-reports');
    } catch (error) {
      console.error('Failed to save report:', error);
      toast({
        title: 'Error',
        description: 'Failed to save report changes',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Report not found
  if (!isLoading && !report) {
    return (
      <div className="min-h-screen bg-background">
        <SimpleHeader title="Edit Report" showLogout={true} showHomeButton={true} />
        <div className="container mx-auto py-8 px-4">
          <Card className="border-destructive">
            <CardContent className="pt-8">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h1 className="text-xl font-bold mb-2">Report Not Found</h1>
                <p className="text-muted-foreground mb-6">
                  The report you're trying to edit doesn't exist.
                </p>
                <Button variant="outline" onClick={() => navigate('/custom-reports')}>
                  Back to Reports
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SimpleHeader title="Edit Report" showLogout={true} showHomeButton={true} />
        <div className="container mx-auto py-12 px-4">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mr-2" />
            <p className="text-muted-foreground">Loading report...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader 
        title={`Edit: ${reportName}`} 
        showLogout={true} 
        showHomeButton={true}
        onRefresh={() => loadReportData(true)}
        isRefreshing={isRefreshing}
      />

      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/custom-reports')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Reports
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Editor Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Report Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Report Name */}
                <div>
                  <Label htmlFor="report-name" className="text-sm">
                    Report Name
                  </Label>
                  <Input
                    id="report-name"
                    placeholder="Report name"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                    className="mt-2 text-sm"
                  />
                </div>

                {/* Columns Selection */}
                <div>
                  <Label className="text-sm">Columns to Display</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Currently showing {selectedColumns.length} of {availableColumns.length} columns � Drag to reorder
                  </p>
                  <ScrollArea className="border rounded-md p-3 h-64">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={availableColumns.map((col) => col.key)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {availableColumns.map((col) => (
                            <SortableColumnItem
                              key={col.key}
                              id={col.key}
                              label={col.key}
                              isSelected={selectedColumns.includes(col.key)}
                              onToggle={(checked) => {
                                if (checked) {
                                  // Add to selected columns maintaining order
                                  const newSelected = availableColumns
                                    .filter(c => selectedColumns.includes(c.key) || c.key === col.key)
                                    .map(c => c.key);
                                  setSelectedColumns(newSelected);
                                } else {
                                  setSelectedColumns(
                                    selectedColumns.filter((c) => c !== col.key)
                                  );
                                }
                              }}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </ScrollArea>
                </div>

                {/* Action Buttons */}
                <div className="border-t pt-4 space-y-2">
                  <Button
                    onClick={handleSaveChanges}
                    disabled={isSaving}
                    className="w-full"
                  >
                    {isSaving && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/custom-reports')}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Showing {selectedColumns.length} selected columns
                </p>
              </CardHeader>
              <CardContent>
                {products.length === 0 && availableColumns.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Data Not Available</h3>
                    <p className="text-muted-foreground text-sm">
                      The store(s) associated with this report have been deleted.
                      <br />
                      Please update the report or delete it.
                    </p>
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No products to display
                  </div>
                ) : (
                  <ProductsTable
                    initialProducts={products}
                    visibleColumns={selectedColumns}
                    initialFilterConfig={filterConfig}
                    onFilterConfigChange={setFilterConfig}
                    reportMode={true}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
