import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, type Role } from './AuthContext';

export function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(user.role)) return <Navigate to="/" replace />;

  return <Outlet />;
}
