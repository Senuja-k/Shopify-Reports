import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useStoreManagement } from '@/stores/storeManagement';
import { Store, Layers, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditStoreDialog } from './EditStoreDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';

export function StoreSelector() {
  const { stores, selectedStoreId, viewMode, setSelectedStore, setViewMode, removeStore } =
    useStoreManagement();
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);

  const handleRemoveStore = async (id, name) => {
    setIsDeleting(true);
    try {
      await removeStore(id);
      toast({
        title: 'Store deleted',
        description: `${name} and all related products have been permanently removed.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete store',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* View Mode Toggle */}
      <div className="flex rounded-lg border bg-background p-1">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 px-3 gap-1.5',
            viewMode === 'combined' && 'bg-muted'
          )}
          onClick={() => {
            setViewMode('combined');
            setSelectedStore(null);
          }}
        >
          <Layers className="h-4 w-4" />
          Combined
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 px-3 gap-1.5',
            viewMode === 'individual' && 'bg-muted'
          )}
          onClick={() => {
            if (viewMode !== 'individual') {
              setViewMode('individual');
              setSelectOpen(true);
            }
          }}
        >
          <Store className="h-4 w-4" />
          Individual
        </Button>
      </div>

      {/* Store Selector (visible in both modes) */}
      <div className="flex items-center gap-2">
        <Select
          value={selectedStoreId ?? 'all'}
          open={selectOpen}
          onOpenChange={setSelectOpen}
          onValueChange={(value) => {
            setSelectedStore(value === 'all' ? null : value);
            if (value !== 'all') {
              setViewMode('individual');
            }
          }}
        >
          <SelectTrigger className="w-[200px] bg-background">
            <SelectValue placeholder="Select store" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                All Stores ({stores.length})
              </div>
            </SelectItem>
            {stores.map((store) => (
              <SelectItem key={store.id} value={store.id}>
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  {store.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Store count badge */}
        <Badge variant="secondary" className="hidden sm:flex">
          {stores.length} {stores.length === 1 ? 'store' : 'stores'}
        </Badge>
      </div>

      {/* Edit/Delete selected store (only when a specific store is selected) */}
      {selectedStoreId && (
        <>
          <EditStoreDialog store={stores.find((s) => s.id === selectedStoreId)} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-destructive hover:text-destructive"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Delete Store
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>
                    Are you sure you want to permanently delete "<strong>{stores.find((s) => s.id === selectedStoreId)?.name}</strong>"?
                  </p>
                  <div className="bg-destructive/10 border border-destructive/20 rounded p-3 text-sm text-foreground">
                    <p className="font-semibold mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      This action is permanent and will delete:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>All products and variants for this store</li>
                      <li>All product metafields</li>
                      <li>All orders and line items</li>
                      <li>All sync history and status</li>
                      <li>API keys and tokens</li>
                    </ul>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const store = stores.find((s) => s.id === selectedStoreId);
                    if (store) handleRemoveStore(store.id, store.name);
                  }}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Store'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
