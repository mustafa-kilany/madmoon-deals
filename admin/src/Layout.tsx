// The frame around every page: the menu on the side (BACKEND_PLAN B8.2–B8.5)
// and the signed-in admin.

import { NavLink, Outlet } from 'react-router';
import { useSession } from './session';

const pages = [
  { to: '/', label: 'Overview' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/orders', label: 'Orders' },
  { to: '/orders?filter=problems', label: 'Delivery problems' },
  { to: '/payouts', label: 'Payouts' },
  { to: '/users', label: 'Users' },
  { section: 'Review' },
  { to: '/reports', label: 'Reports' },
  { to: '/risk', label: 'Suspicious accounts' },
  { to: '/certificates', label: 'Test certificates' },
  { section: 'Manage' },
  { to: '/refurbished', label: 'Certified Refurbished' },
  { to: '/couriers', label: 'Couriers' },
] as const;

export function Layout() {
  const { admin, signOut } = useSession();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark">S</span> Sahla Admin
        </div>
        {pages.map(page =>
          'section' in page ? (
            <span key={page.section} className="nav-section">
              {page.section}
            </span>
          ) : (
            <NavLink key={page.to} to={page.to} end={page.to === '/'} className="nav-link">
              {page.label}
            </NavLink>
          ),
        )}
      </nav>
      <div className="main">
        <header className="topbar">
          <span className="muted">
            {admin?.name} · {admin?.email}
          </span>
          <button className="secondary" onClick={() => signOut()}>
            Log out
          </button>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
