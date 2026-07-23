import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Database,
  Gauge,
  LogOut,
  Menu,
  Settings,
  Users,
  Video,
  X,
} from 'lucide-react';
import { hasActiveRecordingSession } from '../lib/session-lock';
import { useAuth } from '../providers/auth-provider';
import { Button } from './ui';

const operatorLinks = [
  { to: '/recording', label: 'Perekaman', icon: Camera },
  { to: '/videos', label: 'Data Video', icon: Video },
];

const adminLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
  ...operatorLinks,
  { to: '/users', label: 'Pengguna', icon: Users },
  { to: '/settings', label: 'Pengaturan', icon: Settings },
  { to: '/audit', label: 'Audit Log', icon: Activity },
];

const activeSessionMessage =
  'Sesi perekaman masih aktif. Akhiri sesi pada halaman Perekaman sebelum berpindah halaman atau keluar.';

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, isAdmin, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const links = isAdmin ? adminLinks : operatorLinks;

  const isNavigationBlocked = (target: string): boolean => {
    return target !== '/recording' && hasActiveRecordingSession(window.sessionStorage);
  };


  useEffect(() => {
    if (location.pathname === '/recording') return;
    if (!hasActiveRecordingSession(window.sessionStorage)) return;
    window.alert(activeSessionMessage);
    navigate('/recording', { replace: true });
  }, [location.pathname, navigate]);

  const handleNavigation = (event: MouseEvent<HTMLAnchorElement>, target: string) => {
    if (isNavigationBlocked(target)) {
      event.preventDefault();
      window.alert(activeSessionMessage);
      return;
    }
    setMobileOpen(false);
  };

  const logout = async () => {
    if (hasActiveRecordingSession(window.sessionStorage)) {
      window.alert(activeSessionMessage);
      return;
    }
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Database size={23} />
          </div>
          <div className="brand-copy">
            <strong>Proof Video</strong>
            <span>System</span>
          </div>
          <button
            className="icon-button sidebar-mobile-close"
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Tutup menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Navigasi utama">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={(event) => handleNavigation(event, to)}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="profile-mini">
            <CircleUserRound size={30} />
            <div>
              <strong>{profile?.full_name}</strong>
              <span>{profile?.role === 'admin' ? 'Admin' : 'Petugas'}</span>
            </div>
          </div>
          <Button type="button" variant="ghost" className="logout-button" onClick={() => void logout()}>
            <LogOut size={18} /> <span>Keluar</span>
          </Button>
        </div>
        <button
          type="button"
          className="sidebar-collapse"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Perluas sidebar' : 'Perkecil sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>
      {mobileOpen ? (
        <button
          type="button"
          className="mobile-overlay"
          onClick={() => setMobileOpen(false)}
          aria-label="Tutup menu"
        />
      ) : null}
      <div className="app-main">
        <header className="mobile-header">
          <button
            className="icon-button"
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
          >
            <Menu size={22} />
          </button>
          <strong>Proof Video System</strong>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
