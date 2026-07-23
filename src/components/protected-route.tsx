import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from './ui';
import { useAuth } from '../providers/auth-provider';

export function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, profile, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="center-screen">
        <Spinner label="Memeriksa sesi" />
      </main>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/recording" replace />;
  }

  return <>{children}</>;
}
