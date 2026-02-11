import { useEffect, useState } from 'react';
import { useReportManagement } from '../stores/reportManagement';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { AlertCircle, Trash2, RefreshCw } from 'lucide-react';
import { useToast } from '../components/ui/use-toast';
import { SimpleHeader } from '../components/dashboard/SimpleHeader';

/**
 * Diagnostic page to inspect and manage report configurations
 * This helps identify unwanted filters in saved reports
 */
export default function ReportDiagnostics() {
  const { reports, loadReports, updateReport, isLoading } = useReportManagement();
  const { toast } = useToast();
  const [updatingReportId, setUpdatingReportId] = useState(null);

  useEffect(() => {
    loadReports({ force: true });
  }, [loadReports]);

  const handleClearFilters = async (reportId, reportName) => {
    try {
      setUpdatingReportId(reportId);
      
      // Update the report to remove all filters
      await updateReport(reportId, {
        filterConfig,
      });

      toast({
        title: 'Filters cleared',
        description: `All filters removed from "${reportName}"`,
      });

      // Reload reports to show updated state
      await loadReports({ force: true });
    } catch (error) {
      console.error('[ReportDiagnostics] Error clearing filters:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear filters',
        variant: 'destructive',
      });
    } finally {
      setUpdatingReportId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SimpleHeader title="Report Diagnostics" subtitle="Inspect report configurations" />
        <div className="container mx-auto py-8 px-4">
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading reports...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader title="Report Diagnostics" subtitle="Inspect and manage report configurations" />
      
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">All Reports</h2>
          <p className="text-muted-foreground">
            View and manage filter configurations for all saved reports
          </p>
        </div>

        {reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Reports Found</h3>
              <p className="text-muted-foreground">
                Create a report from the dashboard to see it here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              const filterCount = report.filterConfig?.items?.length || 0;
              const hasFilters = filterCount > 0;

              return (
                <Card key={report.id} className={hasFilters ? 'border-amber-500/50' : ''}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {report.name}
                          {hasFilters && (
                            <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 border-amber-500/20">
                              {filterCount} filter{filterCount !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Store: {report.storeName} • Share Link: {report.shareLink}
                        </p>
                      </div>
                      {/* Clear Filters button removed */}
                    </div>
                  </CardHeader>
                  
                  {hasFilters && (
                    <CardContent>
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Active Filters:</h4>
                        {report.filterConfig?.items?.map((item, idx) => {
                          // Skip logical operators (AND/OR), only show actual filter conditions
                          if (typeof item === 'string') {
                            return (
                              <div key={idx} className="text-xs text-muted-foreground italic">
                                {item}
                              </div>
                            );
                          }
                          
                          const filter = item;
                          return (
                            <div key={idx} className="bg-muted/50 rounded p-3 text-sm">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">
                                  {filter.field}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {filter.operator}
                                </Badge>
                              </div>
                              <div className="text-muted-foreground">
                                Value: <span className="font-mono">{JSON.stringify(filter.value)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  )}

                  {!hasFilters && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        ✓ No filters configured
                      </p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-8 p-4 bg-muted/50 rounded-lg">
          <h3 className="font-semibold mb-2">How to use:</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Reports with filters show a yellow badge indicating the number of active filters</li>
            <li>• Filters reduce the number of products shown in the public report</li>
            <li>• Click "Clear Filters" to remove all filters from a report</li>
            <li>• This only affects the saved report configuration, not your actual product data</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
