import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { ProtectedRoute } from './components/protected-route';
import { Spinner } from './components/ui';
import { useAuth } from './providers/auth-provider';
import { AuditPage } from './pages/audit-page';
import { DashboardPage } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';
import { NotFoundPage } from './pages/not-found-page';
import { RecordingPage } from './pages/recording-page';
import { SettingsPage } from './pages/settings-page';
import { SetupPage } from './pages/setup-page';
import { UsersPage } from './pages/users-page';
import { VideosPage } from './pages/videos-page';

function HomeRedirect() {
  const { loading, profile } = useAuth();
  if (loading) {
    return (
      <main className="center-screen">
        <Spinner label="Memuat aplikasi" />
      </main>
    );
  }
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'admin' ? '/dashboard' : '/recording'} replace />;
}

function ProtectedPage({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  return (
    <ProtectedRoute adminOnly={adminOnly}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/dashboard" element={<ProtectedPage adminOnly><DashboardPage /></ProtectedPage>} />
      <Route path="/recording" element={<ProtectedPage><RecordingPage /></ProtectedPage>} />
      <Route path="/videos" element={<ProtectedPage><VideosPage /></ProtectedPage>} />
      <Route path="/users" element={<ProtectedPage adminOnly><UsersPage /></ProtectedPage>} />
      <Route path="/settings" element={<ProtectedPage adminOnly><SettingsPage /></ProtectedPage>} />
      <Route path="/audit" element={<ProtectedPage adminOnly><AuditPage /></ProtectedPage>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
