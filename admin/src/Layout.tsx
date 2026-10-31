// The frame around every page: the menu on the side (pages are added here as
// they are built, BACKEND_PLAN B8.3–B8.5) and the signed-in admin.

import { NavLink, Outlet } from 'react-router';
import { useSession } from './session';

const pages = [{ to: '/', label: 'Overview' }];

export function Layout() {
  const { admin, signOut } = useSession();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark">S</span> Sahla Admin
        </div>
        {pages.map(page => (
          <NavLink key={page.to} to={page.to} end className="nav-link">
            {page.label}
          </NavLink>
        ))}
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
