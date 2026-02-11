import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { SimpleHeader } from '../components/dashboard/SimpleHeader';
import { useStoreManagement } from '../stores/storeManagement';
import { useAuth } from '../stores/authStore';
import { useOrganization } from '../stores/organizationStore';
import { supabase } from '../lib/supabase';

/**
 * Diagnostic page to check product counts and identify discrepancies
 */
export default function ProductCountDiagnostics() {
  const { stores, loadStores } = useStoreManagement();
  const user = useAuth((state) => state.user);
  const activeOrganizationId = useOrganization((state) => state.activeOrganizationId);
  const [storeStats, setStoreStats] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const checkCounts = async () => {
    if (!user?.id || !activeOrganizationId) {
      console.error('[ProductCountDiagnostics] No user or organizationId');
      return;
    }

    setLoading(true);
    const stats = [];

    for (const store of stores) {
      try {
        // Count products in database for this store
        const { count, error } = await supabase
          .from('shopify_products')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', store.id)
          .eq('organization_id', activeOrganizationId);

        if (error) {
          console.error(`[ProductCountDiagnostics] Error counting for ${store.name}:`, error);
          stats.push({
            storeId,
            storeName,
            dbCount: 0,
            loading,
          });
        } else {
          stats.push({
            storeId,
            storeName,
            dbCount: dbCount || 0,
            loading,
          });
        }
      } catch (error) {
        console.error(`[ProductCountDiagnostics] Exception for ${store.name}:`, error);
        stats.push({
          storeId,
          storeName,
          dbCount: 0,
          loading,
        });
      }
    }

    setStoreStats(stats);
    setLoading(false);
  };

  useEffect(() => {
    if (stores.length > 0) {
      checkCounts();
    }
  }, [stores.length]);

  const totalDbCount = storeStats.reduce((sum, stat) => sum + stat.dbCount, 0);

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader title="Product Count Diagnostics" subtitle="Check actual vs expected product counts" />
      
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Database Product Counts</h2>
            <p className="text-muted-foreground">
              This shows how many product variant rows are actually stored in the database for each store
            </p>
          </div>
          <Button onClick={checkCounts} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Counts
          </Button>
        </div>

        {/* Summary Card */}
        <Card className="mb-6 border-2 border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              📊 Total Summary
            </CardTitle>
          </CardHeader>
          
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-3xl font-bold text-primary">{totalDbCount}</div>
                <div className="text-sm text-muted-foreground mt-1">Total in Database</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-3xl font-bold">{stores.length}</div>
                <div className="text-sm text-muted-foreground mt-1">Connected Stores</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-3xl font-bold">
                  {stores.length > 0 ? Math.round(totalDbCount / stores.length) : 0}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Avg per Store</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Per-Store Breakdown */}
        <div className="space-y-4">
          {storeStats.length === 0 && !loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Stores Connected</h3>
                <p className="text-muted-foreground">
                  Connect a Shopify store to see product counts
                </p>
              </CardContent>
            </Card>
          ) : (
            storeStats.map((stat) => (
              <Card key={stat.storeId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {stat.storeName}
                      {stat.dbCount > 0 && (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-700 border-green-500/20">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {stat.dbCount} variants
                        </Badge>
                      )}
                      {stat.dbCount === 0 && (
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 border-amber-500/20">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Not synced
                        </Badge>
                      )}
                    </CardTitle>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Database Count</div>
                      <div className="text-2xl font-bold">{stat.dbCount}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Product variant rows
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Store ID</div>
                      <div className="text-sm font-mono bg-muted/50 p-2 rounded mt-1 truncate">
                        {stat.storeId}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Instructions */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>How to Compare with Shopify</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">📌 Important Notes:</h4>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>
                  <strong>Database counts show VARIANTS, not products.</strong> If a product has 5 variants, it counts as 5 rows.
                </li>
                <li>
                  <strong>When comparing with Shopify:</strong>
                  <ul className="ml-6 mt-1 space-y-1">
                    <li>• Go to your Shopify Admin → Products</li>
                    <li>• Click "Export" and select "All products"</li>
                    <li>• Count the total rows in the CSV (excluding header)</li>
                    <li>• This count should match the database count shown here</li>
                  </ul>
                </li>
                <li>
                  <strong>If counts don't match, click the sync button in the dashboard to refresh from Shopify</strong>
                </li>
                <li>
                  <strong>Check the browser console during sync for detailed logs showing:</strong>
                  <ul className="ml-6 mt-1 space-y-1">
                    <li>• 📦 Purple: Products fetched from Shopify</li>
                    <li>• 💾 Blue: Products being saved to database</li>
                    <li>• ✅ Green: Sync completion status</li>
                    <li>• 🔍 Orange: Verification counts</li>
                  </ul>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
