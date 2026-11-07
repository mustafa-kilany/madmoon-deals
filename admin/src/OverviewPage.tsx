// The business numbers at a glance (GET /admin/stats), refreshed every
// minute. Things waiting for an admin come first.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from './api';
import type { Stats } from './types';
import { jod } from './ui';

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
        <span className="muted small">
          Updated {new Date(dataUpdatedAt).toLocaleTimeString()} · <Link to="/analytics">Charts and trends →</Link>
        </span>
      </div>

      <h2>Needs attention</h2>
      <div className="tiles">
        <Tile label="Delivery problems" value={orders.problems} alert to="/orders?filter=problems" />
        <Tile label="Paid orders without a courier" value={orders.toAssign} alert to="/orders?filter=unassigned" />
        <Tile label="Listings hidden by reports" value={queues.hiddenByReports} alert to="/reports" />
        <Tile
          label="Reported, not handled yet"
          value={queues.reportedListings + queues.reportedUsers}
          sub={`${plural(queues.reportedListings, 'listing')} · ${plural(queues.reportedUsers, 'account')}`}
          alert
          to={queues.reportedListings ? '/reports' : '/reports?tab=users'}
        />
        <Tile label="Suspicious accounts to review" value={queues.riskFlags} alert to="/risk" />
        <Tile label="Certificates to check (stamp)" value={queues.certificates} alert to="/certificates" />
      </div>

      <h2>Money</h2>
      <div className="tiles">
        <Tile
          label="Held until delivery"
          value={jod(orders.escrowHeld.totalFils)}
          sub={`${orders.escrowHeld.count} orders`}
          to="/orders?filter=escrow_held"
        />
        <Tile
          label="Payouts to send to sellers"
          value={jod(payouts.pending.amountFils)}
          sub={`${payouts.pending.count} payouts`}
          to="/payouts"
        />
        <Tile
          label="Delivered, last 30 days"
          value={jod(orders.completedLast30Days.totalFils)}
          sub={`${orders.completedLast30Days.count} orders`}
          to="/orders?filter=completed"
        />
        <Tile label="Orders waiting for payment" value={orders.awaitingPayment} to="/orders?filter=awaiting_payment" />
      </div>

      <h2>Marketplace</h2>
      <div className="tiles">
        <Tile label="Customers" value={users.total} sub={`+${users.newThisWeek} this week`} to="/users" />
        <Tile label="Listings on sale" value={listings.active} sub={`+${listings.newThisWeek} new this week`} />
        <Tile label="Active couriers" value={couriers.active} to="/couriers" />
      </div>
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A number; with `to`, a link to the page that lists them. */
function Tile({ label, value, sub, alert, to }: { label: string; value: number | string; sub?: string; alert?: boolean; to?: string }) {
  const className = `card tile${alert && value !== 0 ? ' attention' : ''}${to ? ' link' : ''}`;
  const content = (
    <>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="muted small">{sub}</span>}
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
