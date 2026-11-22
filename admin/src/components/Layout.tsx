import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_LABEL } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useUi } from './Toast';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Bosh sahifa', icon: '🏠', end: true },
  { to: '/schedule', label: 'Efir jadvali', icon: '🗓️' },
  { to: '/programs', label: 'Multfilmlar', icon: '🎬' },
  { to: '/channels', label: 'Kanallar', icon: '📺' },
];
const SUPER_NAV: NavItem[] = [
  { to: '/regions', label: 'Davlatlar / Timezone', icon: '🌍' },
  { to: '/users', label: 'Adminlar', icon: '👤' },
];

export function Layout() {
  const { admin, logout, logoutAll, isSuper } = useAuth();
  const ui = useUi();
  const [menuOpen, setMenuOpen] = useState(false);

  const onLogoutAll = async () => {
    const ok = await ui.confirm({
      title: 'Barcha qurilmalardan chiqish',
      text: "Barcha brauzer va qurilmalardagi sessiyalaringiz yopiladi.",
      confirmLabel: 'Chiqish',
      danger: true,
    });
    if (ok) await logoutAll();
  };

  const items = isSuper ? [...NAV, ...SUPER_NAV] : NAV;

  return (
    <div className={`app ${menuOpen ? 'menu-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">📺</span>
          <div>
            <b>Kids TV</b>
            <small>Admin panel</small>
          </div>
        </div>
        <nav>
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenuOpen(false)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <div className="avatar">{(admin?.fullName ?? admin?.email ?? '?').slice(0, 1).toUpperCase()}</div>
            <div className="me-text">
              <b title={admin?.email}>{admin?.fullName ?? admin?.email}</b>
              <small>{admin ? ROLE_LABEL[admin.role] : ''}</small>
            </div>
          </div>
          <div className="row gap-sm">
            <button className="btn btn-sm btn-ghost grow" onClick={() => void logout()}>
              Chiqish
            </button>
            <button className="btn btn-sm btn-ghost" title="Barcha qurilmalardan chiqish" onClick={onLogoutAll}>
              ⏻
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn burger" onClick={() => setMenuOpen((v) => !v)} aria-label="Menyu">
            ☰
          </button>
          <b>Kids TV Admin</b>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />
    </div>
  );
}
