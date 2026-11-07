// One order for support (GET /admin/orders/:id): who, what, where, the money,
// and what admins did to it. Actions: assign a courier, unlock the delivery
// PIN, refund, and a delivery problem's retry / refund (docs/API.md → Orders, Couriers, B15).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { reasonLabel } from '@/lib/deliveryProblems';
import { api } from './api';
import type { Courier, Order, OrderSummary } from './types';
import { areaName, Badge, ConfirmDialog, courierLabel, Failed, History, jod, Loading, OrderBadge, when } from './ui';

type Dialog = 'refund' | 'unlock' | null;

export function OrderPage() {
  const id = useParams().id!;
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const { data: o, isPending, isError, error, refetch } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<Order>(`/admin/orders/${encodeURIComponent(id)}`),
  });
  const changed = () => {
    queryClient.invalidateQueries({ queryKey: ['order', id] });
    queryClient.invalidateQueries({ queryKey: ['actions', 'order', id] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  if (isPending) return <div className="page"><Loading /></div>;
  if (isError) return <div className="page"><Failed error={error} retry={refetch} /></div>;

  const canAssign = o.status === 'escrow_held' && (!o.courierStatus || o.courierStatus === 'to_pickup');
  return (
    <div className="page">
      <p className="small">
        <Link to="/orders">← Orders</Link>
      </p>
      <div className="page-head">
        <h1>
          {o.id} <OrderBadge status={o.status} />
        </h1>
        <div className="actions">
          {o.pinLocked && (
            <button className="secondary" onClick={() => setDialog('unlock')}>
              Unlock PIN
            </button>
          )}
          {o.status === 'escrow_held' && (
            <button className="danger" onClick={() => setDialog('refund')}>
              Refund
            </button>
          )}
        </div>
      </div>

      {(o.cancel || o.itemIssue || o.deliveryFailed || o.problemResolution) && (
        <section className={`card box${o.problem ? ' attention' : ''}`}>
          <h2>{o.problem ? 'Delivery problem: decide what happens' : 'What happened'}</h2>
          <dl>
            {o.cancel && <ProblemRow title="Buyer cancelled" p={o.cancel} />}
            {o.itemIssue && <ProblemRow title="Buyer reported at the door" p={o.itemIssue} />}
            {o.deliveryFailed && (
              <ProblemRow title={`Driver: failed at the ${o.deliveryFailed.stage === 'pickup' ? 'seller (pickup)' : 'buyer (drop-off)'}`} p={o.deliveryFailed} />
            )}
            {o.problemResolution && (
              <>
                <dt>Decided</dt>
                <dd>
                  {o.problemResolution.action === 'retry' ? 'Try again' : 'Refund'} · {when(o.problemResolution.at)}
                </dd>
              </>
            )}
          </dl>
          {o.problem && <ResolveProblem order={o} onDone={changed} />}
        </section>
      )}

      <div className="grid-2">
        <section className="card box">
          <h2>Item</h2>
          <div className="item">
            {o.item.imageUrl && <img src={o.item.imageUrl} alt="" />}
            <div>
              <div>{o.item.title}</div>
              <div className="muted small">{o.offerId ? 'At an accepted offer’s price' : 'At the listing price'}</div>
            </div>
          </div>
          <dl>
            <dt>Item</dt>
            <dd>{jod(o.itemPriceFils)}</dd>
            <dt>Buyer protection</dt>
            <dd>{jod(o.buyerProtectionFils)}</dd>
            <dt>Delivery</dt>
            <dd>{jod(o.deliveryFils)}</dd>
            <dt>Total paid</dt>
            <dd>
              <strong>{jod(o.totalFils)}</strong>
            </dd>
          </dl>
        </section>

        <section className="card box">
          <h2>Timeline</h2>
          <dl>
            <dt>Ordered</dt>
            <dd>{when(o.createdAt)}</dd>
            <dt>Paid</dt>
            <dd>{when(o.paidAt)}</dd>
            <dt>Courier assigned</dt>
            <dd>{when(o.assignedAt)}</dd>
            <dt>Picked up</dt>
            <dd>{when(o.pickedUpAt)}</dd>
            <dt>Delivered</dt>
            <dd>{when(o.deliveredAt)}</dd>
            {o.refundedAt && (
              <>
                <dt>Refunded</dt>
                <dd>{when(o.refundedAt)}</dd>
              </>
            )}
          </dl>
          {o.status === 'escrow_held' && (
            <p className={o.pinLocked ? 'error' : 'muted small'}>
              Delivery PIN: {o.pinAttempts} of 5 tries used{o.pinLocked && ' — locked. Unlock it once the buyer confirms it’s really the courier.'}
            </p>
          )}
        </section>

        <section className="card box">
          <h2>Buyer · deliver to</h2>
          <PersonLine person={o.buyer} />
          <Address a={o.delivery} />
        </section>

        <section className="card box">
          <h2>Seller · pick up from</h2>
          <PersonLine person={o.seller} />
          {o.pickup ? <Address a={o.pickup} /> : <p className="muted small">No pickup address on this order (placed before pickups came with listings).</p>}
        </section>

        <section className="card box">
          <h2>Courier</h2>
          <p>
            {o.courier ? (
              <>
                <strong>{o.courier.name}</strong> · {courierLabel(o.courierStatus)}
              </>
            ) : (
              <span className="muted">No courier yet</span>
            )}
          </p>
          {canAssign && <AssignCourier order={o} onDone={changed} />}
        </section>

        <section className="card box">
          <h2>Money</h2>
          {o.payments.length ? (
            <ul className="plain">
              {o.payments.map(p => (
                <li key={p.id}>
                  Card payment {jod(p.amountFils)} · <Badge tone={p.status === 'succeeded' ? 'green' : p.status === 'refunded' ? 'red' : 'grey'}>{p.status}</Badge>{' '}
                  <span className="muted small">{when(p.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No payment tried yet.</p>
          )}
          {o.payout && (
            <p>
              Payout to the seller {jod(o.payout.amountFils)} · <Badge tone={o.payout.status === 'paid' ? 'green' : 'amber'}>{o.payout.status}</Badge>
              {o.payout.paidAt && <span className="muted small"> {when(o.payout.paidAt)}</span>}
            </p>
          )}
        </section>
      </div>

      <section className="card box">
        <h2>Admin actions</h2>
        <History type="order" id={o.id} />
      </section>

      {dialog === 'refund' && (
        <ConfirmDialog
          title={`Refund ${o.id}?`}
          body={
            <p>
              {jod(o.totalFils)} goes back to the buyer’s card and the listing goes on sale again. This can’t be undone.
            </p>
          }
          confirmLabel="Refund"
          danger
          onConfirm={() => api.post(`/admin/orders/${o.id}/refund`).then(changed)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'unlock' && (
        <ConfirmDialog
          title="Unlock the delivery PIN?"
          body={<p>The courier gets 5 new tries. Do this only after the buyer confirmed the courier at the door is really Sahla’s.</p>}
          confirmLabel="Unlock"
          onConfirm={() => api.post(`/admin/orders/${o.id}/unlock-pin`).then(changed)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function ProblemRow({ title, p }: { title: string; p: { reason: string; note: string | null; at: string | null } }) {
  return (
    <>
      <dt>{title}</dt>
      <dd>
        <strong>{reasonLabel(p.reason).en}</strong> · <span className="muted small">{when(p.at)}</span>
        {p.note && <div className="small">“{p.note}”</div>}
      </dd>
    </>
  );
}

/**
 * B15.4: try the delivery again (the same or another driver, from where it stopped),
 * or refund the buyer; a faulty item can stay off sale.
 */
function ResolveProblem({ order, onDone }: { order: Order; onDone: () => void }) {
  const { data: couriers } = useQuery({ queryKey: ['couriers'], queryFn: () => api.get<Courier[]>('/admin/couriers') });
  const [courierId, setCourierId] = useState('');
  const [relist, setRelist] = useState(!order.itemIssue && order.deliveryFailed?.stage !== 'dropoff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/orders/${order.id}/resolve-problem`, body);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="resolve">
      <div className="toolbar">
        <select value={courierId} onChange={e => setCourierId(e.target.value)} aria-label="Driver for the retry">
          <option value="">Same driver{order.courier ? ` (${order.courier.name})` : ''}</option>
          {couriers
            ?.filter(c => c.active && c.id !== order.courier?.id)
            .map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <button className="secondary" disabled={busy} onClick={() => send({ action: 'retry', ...(courierId && { courierId }) })}>
          Try again
        </button>
      </div>
      <div className="toolbar">
        <label className="small">
          <input type="checkbox" checked={relist} onChange={e => setRelist(e.target.checked)} /> Put the listing on sale again
        </label>
        <button className="danger" disabled={busy} onClick={() => send({ action: 'refund', relist })}>
          Refund {jod(order.totalFils)}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function PersonLine({ person }: { person: Order['buyer'] }) {
  if (!person) return <p className="muted">A deleted account</p>;
  return (
    <p>
      {person.email ? <Link to={`/users/${person.id}`}>{person.name}</Link> : <strong>{person.name}</strong>}
      {person.email && <span className="muted small"> · {person.email}</span>}
    </p>
  );
}

function Address({ a }: { a: Order['delivery'] }) {
  return (
    <p className="address">
      {a.name} · <a href={`tel:${a.phone}`}>{a.phone}</a>
      <br />
      {a.address}, {areaName(a.cityId)}
      {a.notes && (
        <>
          <br />
          <span className="muted small">Notes: {a.notes}</span>
        </>
      )}
    </p>
  );
}

/**
 * Choose the driver for a paid order (POST /admin/orders/:id/assign): pickup and
 * drop-off reach their screen from the order itself. Also in the Orders list.
 */
export function AssignCourier({
  order,
  onDone,
  compact,
}: {
  order: Pick<OrderSummary, 'id' | 'courier'>;
  onDone: () => void;
  compact?: boolean;
}) {
  const { data: couriers } = useQuery({ queryKey: ['couriers'], queryFn: () => api.get<Courier[]>('/admin/couriers') });
  const [courierId, setCourierId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = couriers?.filter(c => c.active) ?? [];
  if (couriers && !active.length) return <p className="muted small">No active couriers. Add one first.</p>;
  return (
    <form
      className={compact ? 'assign-inline' : 'toolbar'}
      onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api.post(`/admin/orders/${order.id}/assign`, { courierId });
          setCourierId('');
          onDone();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Couldn’t assign');
        } finally {
          setBusy(false);
        }
      }}
    >
      <select value={courierId} onChange={e => setCourierId(e.target.value)} required aria-label="Courier">
        <option value="">{order.courier ? (compact ? 'Change driver…' : 'Give it to another courier…') : 'Choose a driver…'}</option>
        {active
          .filter(c => c.id !== order.courier?.id)
          .map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      <button className="secondary" disabled={!courierId || busy}>
        {busy ? 'Assigning…' : 'Assign'}
      </button>
      {error && <p className={compact ? 'error small' : 'error'}>{error}</p>}
    </form>
  );
}
