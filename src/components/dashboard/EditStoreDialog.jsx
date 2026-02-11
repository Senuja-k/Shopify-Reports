import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Edit2 } from 'lucide-react';
import { useStoreManagement } from '@/stores/storeManagement';

export function EditStoreDialog({ store }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(store.name);
  const [isLoading, setIsLoading] = useState(false);

  const { updateStore } = useStoreManagement();
  const { toast } = useToast();

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'Store name is required',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await updateStore(store.id, { name });

      toast({
        title: 'Store updated',
        description: 'Store name has been saved',
      });

      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Edit2 className="h-4 w-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Store: {store.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="store-name">Store Name</Label>
            <Input
              id="store-name"
              placeholder="e.g., My Shopify Store"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2"
            />
          </div>

          <Button onClick={handleSave} className="w-full" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
