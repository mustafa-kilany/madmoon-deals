// The frame around every page: the menu on the side (BACKEND_PLAN B8.2–B8.5)
// and the signed-in admin.

import { NavLink, Outlet } from 'react-router';
import { useCan, useSession } from './session';
import type { Permission } from './types';

// Each page shows only for admins whose type opens it (B15.7).
const pages: ({ section: string } | { to: string; label: string; needs: Permission })[] = [
  { to: '/', label: 'Overview', needs: 'orders' },
  { to: '/analytics', label: 'Analytics', needs: 'analytics' },
  { to: '/orders', label: 'Orders', needs: 'orders' },
  { to: '/orders?filter=problems', label: 'Delivery problems', needs: 'orders' },
  { to: '/payouts', label: 'Payouts', needs: 'payouts' },
  { to: '/users', label: 'Users', needs: 'orders' },
  { section: 'Review' },
  { to: '/support', label: 'Support chat', needs: 'support' },
  { to: '/reports', label: 'Reports', needs: 'reports' },
  { to: '/risk', label: 'Suspicious accounts', needs: 'risk' },
  { to: '/certificates', label: 'Test certificates', needs: 'certificates' },
  { section: 'Manage' },
  { to: '/refurbished', label: 'Certified Refurbished', needs: 'stores' },
  { to: '/couriers', label: 'Couriers', needs: 'couriers' },
  { to: '/admins', label: 'Admins', needs: 'admins' },
];

export function Layout() {
  const { admin, signOut } = useSession();
  const can = useCan();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark">M</span> Madmoon Deals Admin
        </div>
        {pages
          .filter(page => 'section' in page || can(page.needs))
          .map(page =>
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
            {admin?.name} · {admin?.email} · {admin?.adminRole ?? 'no type'}
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
