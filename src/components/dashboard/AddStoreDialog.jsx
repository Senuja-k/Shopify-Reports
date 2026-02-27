import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Store, HelpCircle, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { getShopifyAuthUrl } from '@/lib/shopify-oauth';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function AddStoreDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [isInitiatingOAuth, setIsInitiatingOAuth] = useState(false);

  const handleOAuthLogin = () => {
    if (!name.trim() || !domain.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Please enter store name and domain first.',
        variant: 'destructive',
      });
      return;
    }

    setIsInitiatingOAuth(true);
    try {
      // Store the pending store info in sessionStorage for after OAuth callback
      const pendingStore = {
        name: name.trim(),
        domain: domain.trim().toLowerCase(),
      };
      sessionStorage.setItem('pendingStore', JSON.stringify(pendingStore));

      // Normalize shop domain
      let shopDomain = domain.trim().toLowerCase();
      if (!shopDomain.includes('.myshopify.com')) {
        shopDomain = `${shopDomain}.myshopify.com`;
      }

      const authUrl = getShopifyAuthUrl(shopDomain);
      window.location.href = authUrl;
    } catch (error) {
      setIsInitiatingOAuth(false);
      toast({
        title: 'OAuth initiation failed',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Store
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Add Shopify Store
          </DialogTitle>
          <DialogDescription>
            Connect a new Shopify store via OAuth. Inventory access will be granted
            after you complete the Shopify authorization flow.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Store Name</Label>
            <Input
              id="name"
              placeholder="My Store"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="domain">Shop Domain</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[250px]">
                    <p>
                      Your Shopify store's myshopify.com domain. For example:
                      "my-store" or "my-store.myshopify.com"
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="domain"
              placeholder="my-store.myshopify.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={isInitiatingOAuth}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isInitiatingOAuth}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleOAuthLogin}
            disabled={isInitiatingOAuth}
            className="bg-shopify-green hover:bg-shopify-green/90"
          >
            {isInitiatingOAuth ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Authenticating...
              </>
            ) : (
              'Authenticate with Shopify'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
