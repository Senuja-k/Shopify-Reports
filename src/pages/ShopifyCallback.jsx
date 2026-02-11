import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeCodeForToken, saveShopifyStore } from '../lib/shopify-oauth';
import { supabase } from '../lib/supabase';
import { useStoreManagement } from '../stores/storeManagement';
import { useOrganization } from '../stores/organizationStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Loader2 } from 'lucide-react';

export default function ShopifyCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);
  const addStore = useStoreManagement((state) => state.addStore);
  const activeOrganizationId = useOrganization((state) => state.activeOrganizationId);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the authorization code and shop from URL parameters
        const code = searchParams.get('code');
        const shop = searchParams.get('shop');
        const state = searchParams.get('state');

        if (!code || !shop) {
          throw new Error('Missing authorization code or shop');
        }

        // Get current user
        const {
          data,
          error,
        } = await supabase.auth.getUser();

        if (error || !data?.user) {
          throw new Error('Not authenticated');
        }

        // Exchange code for access token (Admin API token)
        const shopifyStore = await exchangeCodeForToken(shop, code);
        if (!shopifyStore) {
          throw new Error('Failed to exchange code for token');
        }

        // Save store connection to database for OAuth tracking
        const saved = await saveShopifyStore(data.user.id, shop, shopifyStore.accessToken, activeOrganizationId || undefined);
        if (!saved) {
          throw new Error('Failed to save store connection');
        }

        // Check if this is coming from "Add Store" dialog
        const pendingStoreJson = sessionStorage.getItem('pendingStore');
        console.log('Pending store from session:', pendingStoreJson);
        
        if (pendingStoreJson) {
          try {
            const pendingStore = JSON.parse(pendingStoreJson);
            console.log('Parsed pending store:', pendingStore);
            // Normalize domain
            let normalizedDomain = pendingStore.domain.toLowerCase();
            if (!normalizedDomain.includes('.myshopify.com')) {
              normalizedDomain = `${normalizedDomain}.myshopify.com`;
            }
            normalizedDomain = normalizedDomain.replace(/^https:\/\//, '');
            console.log('Normalized domain:', normalizedDomain);
            console.log('OAuth shop:', shop);
            // Add the store with only admin token from OAuth
            const result = await addStore({
              name: pendingStore.name,
              domain: normalizedDomain,
              adminToken: shopifyStore.accessToken, // Admin token from OAuth exchange
            });
            console.log('Store added successfully with admin token:', result);
            // Clear pending store
            sessionStorage.removeItem('pendingStore');
          } catch (err) {
            console.error('Error adding store from OAuth:', err);
            throw err; // Re-throw so we catch it in the outer catch block
          }
        } else {
          console.warn('No pending store found in session storage');
        }

        setStatus('success');
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          navigate('/');
        }, 2000);
      } catch (err) {
        console.error('OAuth callback error:', err);
        setStatus('error');
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    };

    handleCallback();
  }, [searchParams, navigate, addStore]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Shopify Authentication</CardTitle>
          <CardDescription>Processing your authorization...</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'processing' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-shopify-green" />
              <p className="text-center text-sm text-gray-600">
                Please wait while we complete your authentication...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <svg
                  className="h-5 w-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-center text-sm text-gray-600">
                Store connected successfully Redirecting you to your dashboard...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                <svg
                  className="h-5 w-5 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-center text-sm text-red-600">
                {error || 'Authentication failed. Please try again.'}
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
              >
                Back to Dashboard
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
