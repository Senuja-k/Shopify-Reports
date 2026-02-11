import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/stores/authStore.jsx";
import { useEffect, useRef } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import Login from "./pages/Login";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { CustomReports } from "./pages/CustomReports";
import { EditReport } from "./pages/EditReport.jsx";
import { PublicReport } from "./pages/PublicReport";
import ReportDiagnostics from "./pages/ReportDiagnostics";
import ProductCountDiagnostics from "./pages/ProductCountDiagnostics";
import ShopifyCallback from "./pages/ShopifyCallback";
import { Organizations } from "./pages/Organizations";
import { ensureValidSession } from "./lib/supabase";

const queryClient = new QueryClient();

// Component to handle session refresh on route changes
const SessionRefreshHandler = () => {
  const location = useLocation();
  const isAuthenticated = useAuth((state) => state.isAuthenticated);
  const previousPathRef = useRef(location.pathname);
  
  // Check session on route changes and do full refresh if needed
  // Session validation on route change is disabled; session lasts/tab is open
  
  return null;
};

const App = () => {
  const isAuthenticated = useAuth((state) => state.isAuthenticated);
  const initializeAuth = useAuth((state) => state.initializeAuth);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Removed: No auto reload or session refresh on tab visibility

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <SessionRefreshHandler />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/auth/shopify/callback" element={<ShopifyCallback />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/custom-reports"
                element={
                  <ProtectedRoute>
                    <CustomReports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizations"
                element={
                  <ProtectedRoute>
                    <Organizations />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/custom-reports/edit/:reportId"
                element={
                  <ProtectedRoute>
                    <EditReport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/diagnostics/reports"
                element={
                  <ProtectedRoute>
                    <ReportDiagnostics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/diagnostics/counts"
                element={
                  <ProtectedRoute>
                    <ProductCountDiagnostics />
                  </ProtectedRoute>
                }
              />
              {/* Public report share link - NO authentication required */}
              <Route path="/report/share/:shareLink" element={<PublicReport />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
