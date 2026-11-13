// What people reported (BACKEND_PLAN B8.3). Listings: three different reporters
// hide one until an admin keeps it (back on sale) or removes it (the seller gets
// a push). Accounts: dismiss the reports, or open the account to suspend it.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from './api';
import type { ReportedListing, ReportedUser } from './types';
import { Badge, ConfirmDialog, Failed, jod, Loading, ReasonChips, ReportList, when } from './ui';

type Tab = 'listings' | 'users';
type Decision =
  | { kind: 'keep' | 'remove'; listing: ReportedListing['listing'] }
  | { kind: 'dismiss'; user: ReportedUser['user'] }
  | null;

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'users' ? 'users' : 'listings';
  const [decision, setDecision] = useState<Decision>(null);
  const queryClient = useQueryClient();
  const changed = () => {
    queryClient.invalidateQueries({ queryKey: ['reports'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  return (
    <div className="page">
      <h1>Reports</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'listings'} className={`tab${tab === 'listings' ? ' active' : ''}`} onClick={() => setParams({})}>
          Listings
        </button>
        <button role="tab" aria-selected={tab === 'users'} className={`tab${tab === 'users' ? ' active' : ''}`} onClick={() => setParams({ tab: 'users' })}>
          Accounts
        </button>
      </div>

      {tab === 'listings' ? <ListingReports decide={setDecision} /> : <UserReports decide={setDecision} />}

      {decision?.kind === 'keep' && (
        <ConfirmDialog
          title="Keep this listing?"
          body={
            <p>
              {decision.listing.reportHidden ? 'It goes back on sale and ' : ''}its reports are closed. If more people report it later, it
              comes back here.
            </p>
          }
          inputLabel="Why it’s fine (kept in the audit log)"
          confirmLabel="Keep it"
          onConfirm={reason => api.post(`/admin/listings/${encodeURIComponent(decision.listing.id)}/keep`, { reason }).then(changed)}
          onClose={() => setDecision(null)}
        />
      )}
      {decision?.kind === 'remove' && (
        <ConfirmDialog
          title="Remove this listing?"
          body={<p>It comes off sale for good and the seller gets a notification that it broke Sahla’s rules.</p>}
          inputLabel="What rule it breaks (kept in the audit log)"
          confirmLabel="Remove listing"
          danger
          onConfirm={reason => api.post(`/admin/listings/${encodeURIComponent(decision.listing.id)}/remove`, { reason }).then(changed)}
          onClose={() => setDecision(null)}
        />
      )}
      {decision?.kind === 'dismiss' && (
        <ConfirmDialog
          title={`Dismiss the reports about ${decision.user.name}?`}
          body={<p>The reports are closed and nothing happens to the account. To suspend it instead, open the account.</p>}
          inputLabel="Why nothing is wrong (kept in the audit log)"
          confirmLabel="Dismiss reports"
          onConfirm={reason => api.post(`/admin/reports/users/${decision.user.id}/dismiss`, { reason }).then(changed)}
          onClose={() => setDecision(null)}
        />
      )}
    </div>
  );
}

const listingStatus: Record<ReportedListing['listing']['status'], [string, 'grey' | 'amber' | 'green' | 'red']> = {
  active: ['On sale', 'green'],
  reserved: ['Paid, waiting for delivery', 'amber'],
  sold: ['Sold', 'grey'],
  withdrawn: ['Off sale', 'grey'],
};

function ListingReports({ decide }: { decide: (d: Decision) => void }) {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'listings'],
    queryFn: () => api.get<ReportedListing[]>('/admin/reports/listings'),
  });
  if (isPending) return <Loading />;
  if (isError) return <Failed error={error} retry={refetch} />;
  if (!data.length) return <p className="muted">No reported listings. 🎉</p>;
  return (
    <div className="stack">
      {data.map(({ listing, seller, reasons, reports }) => {
        const [label, tone] = listingStatus[listing.status];
        const canRemove = listing.status === 'active';
        return (
          <article key={listing.id} className={`card box${listing.reportHidden ? ' attention' : ''}`}>
            <div className="queue-head">
              <div className="item">
                {listing.imageUrl && <img src={listing.imageUrl} alt="" />}
                <div>
                  <strong>{listing.title}</strong>
                  <div className="muted small">
                    {jod(listing.priceFils)} · listed {when(listing.createdAt)} · {listing.id}
                  </div>
                  <div className="small">
                    Seller:{' '}
                    {seller ? (
                      seller.email ? (
                        <Link to={`/users/${seller.id}`}>{seller.name}</Link>
                      ) : (
                        <>{seller.name} (brand store)</>
                      )
                    ) : (
                      'a deleted account'
                    )}
                    {seller?.suspended && <> <Badge tone="red">suspended</Badge></>}
                  </div>
                </div>
              </div>
              <div className="actions">
                <button className="secondary" onClick={() => decide({ kind: 'keep', listing })}>
                  {listing.reportHidden ? 'Put back on sale' : 'Keep'}
                </button>
                <button
                  className="danger"
                  disabled={!canRemove}
                  title={canRemove ? undefined : listing.status === 'reserved' ? 'Paid for: refund the order first' : 'Not on sale'}
                  onClick={() => decide({ kind: 'remove', listing })}
                >
                  Remove
                </button>
              </div>
            </div>
            <p className="badges wrap">
              {listing.reportHidden ? <Badge tone="red">Hidden by reports</Badge> : <Badge tone={tone}>{label}</Badge>}
              <ReasonChips reasons={reasons} />
            </p>
            <ReportList reports={reports} />
          </article>
        );
      })}
    </div>
  );
}

function UserReports({ decide }: { decide: (d: Decision) => void }) {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'users'],
    queryFn: () => api.get<ReportedUser[]>('/admin/reports/users'),
  });
  if (isPending) return <Loading />;
  if (isError) return <Failed error={error} retry={refetch} />;
  if (!data.length) return <p className="muted">No reported accounts. 🎉</p>;
  return (
    <div className="stack">
      {data.map(({ user, reasons, reports }) => (
        <article key={user.id} className="card box">
          <div className="queue-head">
            <div>
              <strong>
                <Link to={`/users/${user.id}`}>{user.name}</Link>
              </strong>{' '}
              {user.suspended && <Badge tone="red">suspended</Badge>}
              <div className="muted small">
                {user.email} · joined {when(user.createdAt)}
              </div>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => decide({ kind: 'dismiss', user })}>
                Dismiss
              </button>
              <Link className="button danger" to={`/users/${user.id}`}>
                Open account to suspend
              </Link>
            </div>
          </div>
          <p>
            <ReasonChips reasons={reasons} />
          </p>
          <ReportList reports={reports} />
        </article>
      ))}
    </div>
  );
}
