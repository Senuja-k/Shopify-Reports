import { Navigate } from 'react-router-dom';
import { useAuth } from '@/stores/authStore.jsx';

export function ProtectedRoute({ children }) {
  const isAuthenticated = useAuth((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
