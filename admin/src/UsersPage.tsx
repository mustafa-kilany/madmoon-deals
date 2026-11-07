// Look people up (GET /admin/users) and open one (GET /admin/users/:id) to
// see their activity and suspend or unsuspend them.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from './api';
import { useCan } from './session';
import type { UserDetail, UserSummary } from './types';
import { areaName, Badge, ConfirmDialog, Failed, History, jod, Loading, OrderBadge, when } from './ui';

const signIn = { email: 'Email', google: 'Google', apple: 'Apple' };

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const onlySuspended = params.get('suspended') === 'true';
  const [typed, setTyped] = useState(q);
  const query = new URLSearchParams({ limit: '100', ...(q && { q }), ...(onlySuspended && { suspended: 'true' }) });
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['users', q, onlySuspended],
    queryFn: () => api.get<UserSummary[]>(`/admin/users?${query}`),
  });
  const set = (next: { q?: string; suspended?: boolean }) => {
    const merged = { q, suspended: onlySuspended, ...next };
    setParams({ ...(merged.q && { q: merged.q }), ...(merged.suspended && { suspended: 'true' }) });
  };

  return (
    <div className="page wide">
      <h1>Users</h1>
      <form
        className="toolbar"
        onSubmit={e => {
          e.preventDefault();
          set({ q: typed.trim() });
        }}
      >
        <input type="search" placeholder="Email, name or user id" value={typed} onChange={e => setTyped(e.target.value)} />
        <button className="secondary">Search</button>
        <label className="check">
          <input type="checkbox" checked={onlySuspended} onChange={e => set({ suspended: e.target.checked })} /> Suspended only
        </label>
      </form>

      {isPending ? (
        <Loading />
      ) : isError ? (
        <Failed error={error} retry={refetch} />
      ) : !data.length ? (
        <p className="muted">No users{q && ` for “${q}”`}.</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Signs in with</th>
                <th>Area</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map(u => (
                <tr key={u.id}>
                  <td className="clip">
                    <Link to={`/users/${u.id}`}>{u.name}</Link>
                  </td>
                  <td className="clip">{u.email}</td>
                  <td>{signIn[u.method]}</td>
                  <td className="clip">{areaName(u.cityId)}</td>
                  <td className="small">{when(u.createdAt)}</td>
                  <td>
                    <UserBadges user={u} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const UserBadges = ({ user }: { user: UserSummary }) => (
  <span className="badges">
    {user.role && <Badge tone="grey">{user.role}</Badge>}
    {user.verified && <Badge tone="green">verified</Badge>}
    {user.suspended && <Badge tone="red">suspended</Badge>}
  </span>
);

export function UserPage() {
  const id = useParams().id!;
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const can = useCan();
  const { data: u, isPending, isError, error, refetch } = useQuery({
    queryKey: ['user', id],
    queryFn: () => api.get<UserDetail>(`/admin/users/${encodeURIComponent(id)}`),
  });
  if (isPending) return <div className="page"><Loading /></div>;
  if (isError) return <div className="page"><Failed error={error} retry={refetch} /></div>;

  const orderList = (rows: UserDetail['recentOrders']) =>
    rows.length ? (
      <ul className="plain">
        {rows.map(o => (
          <li key={o.id}>
            <Link to={`/orders/${o.id}`}>{o.id}</Link> · {jod(o.totalFils)} · <OrderBadge status={o.status} />
          </li>
        ))}
      </ul>
    ) : (
      <p className="muted small">None.</p>
    );

  return (
    <div className="page">
      <p className="small">
        <Link to="/users">← Users</Link>
      </p>
      <div className="page-head">
        <h1>
          {u.name} <UserBadges user={u} />
        </h1>
        {!u.role && can('suspend') && (
          <div className="actions">
            <button className={u.suspended ? 'secondary' : 'danger'} onClick={() => setDialog(true)}>
              {u.suspended ? 'Lift suspension' : 'Suspend'}
            </button>
          </div>
        )}
      </div>
      <p className="muted">
        {u.email} · signs in with {signIn[u.method]} · {areaName(u.cityId)} · joined {when(u.createdAt)}
      </p>

      <div className="grid-2">
        <section className="card box">
          <h2>Activity</h2>
          <dl>
            <dt>Listings on sale</dt>
            <dd>{u.listings.active ?? 0}</dd>
            <dt>Sold</dt>
            <dd>{u.listings.sold ?? 0}</dd>
            <dt>Orders (paid)</dt>
            <dd>{u.counts.orders}</dd>
            <dt>Sales (paid)</dt>
            <dd>{u.counts.sales}</dd>
          </dl>
        </section>
        <section className="card box">
          <h2>Trust</h2>
          <dl>
            <dt>Reports about them</dt>
            <dd>{u.counts.reportsAboutUser}</dd>
            <dt>Reports about their listings</dt>
            <dd>{u.counts.reportsAboutListings}</dd>
            <dt>Blocked by</dt>
            <dd>{u.counts.blockedBy} people</dd>
          </dl>
          {u.riskFlags.map(f => (
            <p key={f.id} className="small">
              <Badge tone={f.status === 'open' ? 'amber' : 'grey'}>risk {f.score}</Badge> {f.status} · {when(f.createdAt)}
              {f.aiSummary && <span className="muted"> · {f.aiSummary}</span>}
            </p>
          ))}
        </section>
        <section className="card box">
          <h2>Latest orders</h2>
          {orderList(u.recentOrders)}
        </section>
        <section className="card box">
          <h2>Latest sales</h2>
          {orderList(u.recentSales)}
        </section>
      </div>

      <section className="card box">
        <h2>Admin actions</h2>
        <History type="user" id={u.id} />
      </section>

      {dialog && (
        <ConfirmDialog
          title={u.suspended ? `Lift ${u.name}’s suspension?` : `Suspend ${u.name}?`}
          body={
            u.suspended ? (
              <p>They can log in again and their listings go back on sale.</p>
            ) : (
              <p>
                They are signed out on every phone, can’t log in, and their listings come off sale. Their paid orders carry on
                (refund them from the order page if needed).
              </p>
            )
          }
          inputLabel="Reason (kept in the audit log)"
          confirmLabel={u.suspended ? 'Lift suspension' : 'Suspend'}
          danger={!u.suspended}
          onConfirm={reason =>
            api.post(`/admin/users/${u.id}/${u.suspended ? 'unsuspend' : 'suspend'}`, { reason }).then(() => {
              queryClient.invalidateQueries({ queryKey: ['user', id] });
              queryClient.invalidateQueries({ queryKey: ['actions', 'user', id] });
              queryClient.invalidateQueries({ queryKey: ['users'] });
            })
          }
          onClose={() => setDialog(false)}
        />
      )}
    </div>
  );
}
