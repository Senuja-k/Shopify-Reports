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
import { useStoreManagement } from '@/stores/storeManagement';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/stores/authStore.jsx';
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
  // Remove storefrontToken state
  const [adminToken, setAdminToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [authMethod, setAuthMethod] = useState('manual');
  const [isInitiatingOAuth, setIsInitiatingOAuth] = useState(false);

  const addStore = useStoreManagement((state) => state.addStore);
  const user = useAuth((state) => state.user);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim() || !domain.trim() || !adminToken.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Please fill in store name, domain, and admin API token.',
        variant: 'destructive',
      });
      return;
    }

    // Normalize domain
    let normalizedDomain = domain.trim().toLowerCase();
    if (!normalizedDomain.includes('.myshopify.com')) {
      normalizedDomain = `${normalizedDomain}.myshopify.com`;
    }
    normalizedDomain = normalizedDomain.replace(/^https:\/\//, '');

    setIsValidating(true);

    // Validate at least one token works
    try {
      if (adminToken.trim()) {
        const testUrl = `https://${normalizedDomain}/admin/api/2025-07/graphql.json`;
        const response = await fetch(testUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `{ shop { name } }`,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.errors) {
          throw new Error(data.errors[0]?.message || 'Invalid Admin token');
        }
      }

      // Store validated successfully
      await addStore({
        name: name.trim(),
        domain,
        adminToken: adminToken.trim() || undefined,
      });

      toast({
        title: 'Store added',
        description: `${name} has been added to your dashboard. Inventory data is enabled.`,
      });

      // Reset form
      setName('');
      setDomain('');
      setAdminToken('');
      setAuthMethod('manual');
      setOpen(false);
    } catch (error) {
      toast({
        title: 'Connection failed',
        description:
          error instanceof Error
            ? error.message
            : 'Could not connect to the store. Please check your credentials.',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

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

      // Get OAuth URL with the shop parameter
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
            Connect a new Shopify store using OAuth or manual token entry.
          </DialogDescription>
        </DialogHeader>

        {/* Auth Method Selector */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setAuthMethod('oauth')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              authMethod === 'oauth'
                ? 'bg-shopify-green text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Shopify OAuth
          </button>
          <button
            type="button"
            onClick={() => setAuthMethod('manual')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              authMethod === 'manual'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Manual Tokens
          </button>
        </div>

        <form onSubmit={authMethod === 'manual' ? handleSubmit : undefined}>
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
                disabled={authMethod === 'oauth' && isInitiatingOAuth}
              />
            </div>

            {authMethod === 'oauth' ? (
              <div className="space-y-3 pt-4 border-t">
                <div className="p-3 bg-shopify-green/10 rounded border border-shopify-green/20">
                  <p className="text-sm text-gray-700">
                    Click "Authenticate with Shopify" below to authorize this app and automatically get your Admin API token.
                  </p>
                </div>
                {/* Storefront token input removed */}
              </div>
            ) : (
              <>
                {/* Storefront token input removed */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="adminToken">Admin API Token (Optional - for inventory)</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[300px]">
                          <p>
                            Optional. Enables inventory data display. Found in Shopify Admin → Settings → Apps and sales channels → Develop apps → Your app → Configuration → Admin API → Access tokens
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="adminToken"
                    type="password"
                    placeholder="shpat_xxxxxxxxxxxxx (Admin token)"
                    value={adminToken}
                    onChange={(e) => setAdminToken(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setAuthMethod('manual');
              }}
              disabled={isValidating || isInitiatingOAuth}
            >
              Cancel
            </Button>
            {authMethod === 'oauth' ? (
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
                  <>
                    Authenticate with Shopify
                  </>
                )}
              </Button>
            ) : (
              <Button type="submit" disabled={isValidating}>
                {isValidating ? 'Validating...' : 'Add Store'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
