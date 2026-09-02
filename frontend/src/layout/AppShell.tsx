import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV_BY_ROLE: Record<string, { to: string; label: string }[]> = {
  super_admin: [{ to: '/', label: 'Pharmacies' }],
  pharmacy_admin: [
    { to: '/', label: 'Dashboard' },
    { to: '/sell', label: 'Sell' },
    { to: '/products', label: 'Products' },
    { to: '/purchases', label: 'Stock-in' },
    { to: '/suppliers', label: 'Suppliers' },
    { to: '/sales-history', label: 'Sales' },
    { to: '/staff', label: 'Staff' },
  ],
  manager: [
    { to: '/', label: 'Dashboard' },
    { to: '/products', label: 'Products' },
    { to: '/purchases', label: 'Stock-in' },
    { to: '/suppliers', label: 'Suppliers' },
    { to: '/sales-history', label: 'Sales' },
  ],
  salesman: [{ to: '/', label: 'Sell' }],
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  pharmacy_admin: 'Pharmacy Admin',
  manager: 'Manager',
  salesman: 'Salesman',
};

export function AppShell() {
  const { user, logout } = useAuth();
  // Below 900px the sidebar becomes an off-canvas drawer (see .app-sidebar in
  // index.css) opened from the topbar's hamburger button; above that breakpoint
  // this state is simply unused since the CSS keeps the sidebar always visible.
  const [navOpen, setNavOpen] = useState(false);
  if (!user) return null;
  const nav = NAV_BY_ROLE[user.role] ?? [];

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />

      <aside className={`app-sidebar ${navOpen ? 'open' : ''}`}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 24 }}>Pharmacy ERP</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              onClick={() => setNavOpen(false)}
              style={({ isActive }) => ({
                padding: '9px 12px',
                borderRadius: 6,
                textDecoration: 'none',
                color: isActive ? 'white' : 'var(--text)',
                background: isActive ? 'var(--primary)' : 'transparent',
                fontSize: 14,
                fontWeight: 500,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>{user.name}</div>
          <div style={{ color: 'var(--text-muted)' }}>{ROLE_LABEL[user.role]}</div>
          <button className="btn-secondary btn" style={{ marginTop: 10, width: '100%' }} onClick={logout}>
            Log out
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="app-topbar">
          <button className="hamburger-btn" onClick={() => setNavOpen((o) => !o)} aria-label="Toggle menu">
            ☰
          </button>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Pharmacy ERP</div>
        </div>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
