import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut, FileText, Home, RefreshCw } from 'lucide-react';
import { useAuth } from '@/stores/authStore.jsx';

export function SimpleHeader({ 
  title, 
  subtitle, 
  showReportsLink = false,
  showLogout = true,
  showHomeButton = false,
  showWelcome = true,
  onSignOut,
  onRefresh,
  isRefreshing = false,
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    if (onSignOut) {
      onSignOut();
    } else {
      logout();
      navigate('/login');
    }
  };

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto py-4 px-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-3">
            {showWelcome && user && (
              <div className="text-sm text-muted-foreground">
                Welcome, <span className="font-medium">{user.name}</span>
              </div>
            )}
            
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Syncing...' : 'Refresh'}
              </Button>
            )}
            
            {showReportsLink && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/custom-reports')}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Custom Reports
              </Button>
            )}

            {showHomeButton && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/')}
                className="gap-2"
              >
                <Home className="h-4 w-4" />
                Dashboard
              </Button>
            )}

            {showLogout && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
