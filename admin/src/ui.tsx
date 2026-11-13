// Small pieces every page uses: money, dates, area names, status badges, the
// action history of one order or user, and a dialog that asks for a reason.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { formatJOD } from '@/lib/money';
import { cities } from '@/services/mock/places';
import { api } from './api';
import type { AdminAction, CourierStatus, OrderStatus, Report, ReportReason } from './types';

export const jod = (fils: number) => formatJOD(fils, 'en');
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const areaName = (id: string | null) => (id ? (cities.find(c => c.id === id)?.name.en ?? id) : '—');

const orderStatus: Record<OrderStatus, [string, string]> = {
  awaiting_payment: ['Waiting for payment', 'grey'],
  escrow_held: ['Paid, not delivered', 'amber'],
  completed: ['Delivered', 'green'],
  refunded: ['Refunded', 'red'],
  cancelled: ['Cancelled by the buyer', 'grey'],
};
const courierStatus: Record<CourierStatus, string> = {
  to_pickup: 'Courier to pick up',
  picked_up: 'With the courier',
  delivered: 'Delivered',
  failed: 'Delivery failed',
};

export const OrderBadge = ({ status }: { status: OrderStatus }) => (
  <span className={`badge ${orderStatus[status][1]}`}>{orderStatus[status][0]}</span>
);
export const courierLabel = (status: CourierStatus | null) => (status ? courierStatus[status] : 'No courier yet');
export const Badge = ({ tone, children }: { tone: 'grey' | 'amber' | 'green' | 'red'; children: ReactNode }) => (
  <span className={`badge ${tone}`}>{children}</span>
);

export function Loading() {
  return <p className="muted">Loading…</p>;
}
export function Failed({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div>
      <p className="error">{error.message}</p>
      <button className="secondary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

const actionLabels: Record<string, string> = {
  'order.refund': 'Refunded the order',
  'order.unlock_pin': 'Unlocked the delivery PIN',
  'order.assign': 'Assigned a courier',
  'payout.paid': 'Marked the payout as sent',
  'user.suspend': 'Suspended the account',
  'user.unsuspend': 'Lifted the suspension',
  'courier.create': 'Added the courier',
  'courier.disable': 'Disabled the courier',
  'courier.enable': 'Enabled the courier again',
  'listing.keep': 'Kept the reported listing',
  'listing.remove': 'Removed the listing',
  'user.reports_dismiss': 'Dismissed the reports about them',
  'risk_flag.dismissed': 'Dismissed a risk flag',
  'risk_flag.actioned': 'Dealt with a risk flag',
  'certificate.approve': 'Approved the certificate',
  'certificate.reject': 'Rejected the certificate',
  'store.create': 'Created the store',
  'store.key_create': 'Made an API key',
  'store.key_revoke': 'Revoked an API key',
  'store.import': 'Imported the sheet',
  'store.pickup': 'Set the pickup address',
};

/** What admins did to this order or user (GET /admin/actions), newest first. */
export function History({ type, id }: { type: string; id: string }) {
  const { data } = useQuery({
    queryKey: ['actions', type, id],
    queryFn: () => api.get<AdminAction[]>(`/admin/actions?targetType=${type}&targetId=${encodeURIComponent(id)}`),
  });
  if (!data) return null;
  if (!data.length) return <p className="muted small">No admin actions yet.</p>;
  return (
    <ul className="history">
      {data.map(a => {
        const details = a.details as { reason?: string; reference?: string } | undefined;
        return (
          <li key={a.id}>
            <strong>{actionLabels[a.action] ?? a.action}</strong> · {a.admin?.name ?? 'a deleted admin'} · {when(a.createdAt)}
            {details?.reason && <div className="muted small">Reason: {details.reason}</div>}
            {details?.reference && <div className="muted small">Bank reference: {details.reference}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Asks before a change that matters, with a text the audit log keeps (a
 * reason, a bank reference). `onConfirm` may throw: its message is shown.
 */
export function ConfirmDialog({
  title,
  body,
  inputLabel,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  inputLabel?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (text: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  };
  return (
    <div className="overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <form className="card dialog" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit} onClick={e => e.stopPropagation()}>
        <h2 className="dialog-title">{title}</h2>
        <div className="dialog-body">{body}</div>
        {inputLabel && (
          <label>
            {inputLabel}
            <input value={text} onChange={e => setText(e.target.value)} required minLength={3} autoFocus />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="dialog-buttons">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={danger ? 'danger' : 'primary'} disabled={busy || (!!inputLabel && text.trim().length < 3)}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export const reasonLabels: Record<ReportReason, string> = {
  scam: 'Scam or fraud',
  prohibited: 'Prohibited item',
  offensive: 'Offensive',
  wrong_info: 'Wrong information',
  other: 'Other',
};

/** "Scam or fraud ×3 · Offensive ×1" */
export const ReasonChips = ({ reasons }: { reasons: Partial<Record<ReportReason, number>> }) => (
  <span className="badges wrap">
    {(Object.entries(reasons) as [ReportReason, number][]).map(([reason, count]) => (
      <Badge key={reason} tone={reason === 'scam' || reason === 'prohibited' ? 'red' : 'amber'}>
        {reasonLabels[reason] ?? reason} ×{count}
      </Badge>
    ))}
  </span>
);

/** Who reported, why and when, with what they wrote. */
export const ReportList = ({ reports }: { reports: Report[] }) => (
  <ul className="plain reports">
    {reports.map(r => (
      <li key={r.id}>
        <span className="small">
          <Link to={`/users/${r.reporter.id}`}>{r.reporter.name}</Link> · {reasonLabels[r.reason] ?? r.reason} · {when(r.createdAt)}
        </span>
        {r.details && <div className="quote">“{r.details}”</div>}
      </li>
    ))}
  </ul>
);

/** An image only admins may see, loaded with the dashboard token. */
export function PrivateImage({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    api
      .blob(path)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(e => !cancelled && setError(e instanceof Error ? e.message : 'Couldn’t load the photo'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  if (error) return <p className="error small">{error}</p>;
  if (!url) return <div className="photo placeholder muted small">Loading photo…</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open full size">
      <img className="photo" src={url} alt={alt} />
    </a>
  );
}
