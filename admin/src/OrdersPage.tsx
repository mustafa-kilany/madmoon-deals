// Find an order (GET /admin/orders): by number, the buyer's or seller's email
// or name, or what state it's in. A row opens the order.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from './api';
import type { OrderSummary } from './types';
import { courierLabel, Failed, jod, Loading, OrderBadge, when } from './ui';

const filters = [
  { key: '', label: 'All' },
  { key: 'unassigned', label: 'Need a courier' },
  { key: 'escrow_held', label: 'Paid, not delivered' },
  { key: 'completed', label: 'Delivered' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'awaiting_payment', label: 'Waiting for payment' },
];

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') ?? '';
  const q = params.get('q') ?? '';
  const [typed, setTyped] = useState(q);

  const query = new URLSearchParams({ limit: '100' });
  if (q) query.set('q', q);
  if (filter === 'unassigned') query.set('unassigned', 'true');
  else if (filter) query.set('status', filter);
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['orders', filter, q],
    queryFn: () => api.get<OrderSummary[]>(`/admin/orders?${query}`),
  });

  const set = (next: { filter?: string; q?: string }) => {
    const merged = { filter, q, ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, v]) => v)));
  };

  return (
    <div className="page wide">
      <h1>Orders</h1>
      <form
        className="toolbar"
        onSubmit={e => {
          e.preventDefault();
          set({ q: typed.trim() });
        }}
      >
        <input type="search" placeholder="Order number (SA-…), email or name" value={typed} onChange={e => setTyped(e.target.value)} />
        <button className="secondary">Search</button>
      </form>
      <div className="tabs" role="tablist">
        {filters.map(f => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'tab active' : 'tab'} onClick={() => set({ filter: f.key })}>
            {f.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <Loading />
      ) : isError ? (
        <Failed error={error} retry={refetch} />
      ) : !data.length ? (
        <p className="muted">No orders{q && ` for “${q}”`}.</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Item</th>
                <th>Buyer</th>
                <th>Seller</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th>Delivery</th>
                <th>Ordered</th>
              </tr>
            </thead>
            <tbody>
              {data.map(o => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/orders/${o.id}`}>{o.id}</Link>
                  </td>
                  <td className="clip">{o.item.title}</td>
                  <td className="clip">{o.buyer?.name ?? <span className="muted">deleted account</span>}</td>
                  <td className="clip">{o.seller?.name ?? <span className="muted">deleted account</span>}</td>
                  <td className="num">{jod(o.totalFils)}</td>
                  <td>
                    <OrderBadge status={o.status} />
                  </td>
                  <td className="small">{o.status === 'escrow_held' ? (o.courier ? `${courierLabel(o.courierStatus)}: ${o.courier.name}` : 'No courier yet') : '—'}</td>
                  <td className="small">{when(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
