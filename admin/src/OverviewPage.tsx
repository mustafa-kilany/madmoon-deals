// The business numbers at a glance (GET /admin/stats), refreshed every
// minute. Things waiting for an admin come first.

import { useQuery } from '@tanstack/react-query';
import { formatJOD } from '@/lib/money';
import { api } from './api';
import type { Stats } from './types';

const jod = (fils: number) => formatJOD(fils, 'en');

export function OverviewPage() {
  const { data, isPending, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<Stats>('/admin/stats'),
    refetchInterval: 60_000,
  });

  if (isPending) return <p className="page muted">Loading…</p>;
  if (isError)
    return (
      <div className="page">
        <p className="error">{error.message}</p>
        <button className="secondary" onClick={() => refetch()}>
          Try again
        </button>
      </div>
    );

  const { users, listings, orders, payouts, queues, couriers } = data;
  return (
    <div className="page">
      <div className="page-head">
        <h1>Overview</h1>
        <span className="muted small">Updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
      </div>

      <h2>Needs attention</h2>
      <div className="tiles">
        <Tile label="Paid orders without a courier" value={orders.toAssign} alert />
        <Tile label="Listings hidden by reports" value={queues.hiddenByReports} alert />
        <Tile label="Suspicious accounts to review" value={queues.riskFlags} alert />
        <Tile label="Certificates to check (stamp)" value={queues.certificates} alert />
      </div>

      <h2>Money</h2>
      <div className="tiles">
        <Tile label="Held until delivery" value={jod(orders.escrowHeld.totalFils)} sub={`${orders.escrowHeld.count} orders`} />
        <Tile
          label="Payouts to send to sellers"
          value={jod(payouts.pending.amountFils)}
          sub={`${payouts.pending.count} payouts`}
        />
        <Tile
          label="Delivered, last 30 days"
          value={jod(orders.completedLast30Days.totalFils)}
          sub={`${orders.completedLast30Days.count} orders`}
        />
        <Tile label="Orders waiting for payment" value={orders.awaitingPayment} />
      </div>

      <h2>Marketplace</h2>
      <div className="tiles">
        <Tile label="Customers" value={users.total} sub={`+${users.newThisWeek} this week`} />
        <Tile label="Listings on sale" value={listings.active} sub={`+${listings.newThisWeek} new this week`} />
        <Tile label="Active couriers" value={couriers.active} />
      </div>
    </div>
  );
}

function Tile({ label, value, sub, alert }: { label: string; value: number | string; sub?: string; alert?: boolean }) {
  const attention = alert && value !== 0;
  return (
    <div className={`card tile${attention ? ' attention' : ''}`}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  );
}
