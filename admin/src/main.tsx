import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './Layout';
import { LoginPage } from './LoginPage';
import { OrderPage } from './OrderPage';
import { OrdersPage } from './OrdersPage';
import { OverviewPage } from './OverviewPage';
import { PayoutsPage } from './PayoutsPage';
import { SessionProvider, useSession } from './session';
import './styles.css';
import { UserPage, UsersPage } from './UsersPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

/** Signed out: every address shows the log-in page. */
function Pages() {
  const { admin } = useSession();
  if (admin === undefined) return <p className="page muted">Loading…</p>;
  if (!admin) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderPage />} />
        <Route path="payouts" element={<PayoutsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <Pages />
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
