// Suspicious accounts (BACKEND_PLAN B5.3 → B8.3). The checker only flags, it
// never acts: an admin looks at the signals and either dismisses the flag or
// deals with the account (suspend it from the account page) and says so here.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from './api';
import type { RiskFlag, RiskFlagStatus } from './types';
import { Badge, ConfirmDialog, Failed, Loading, when } from './ui';

/** docs/ACCOUNT-RISK.md: what each signal means, in plain words. */
const signalLabels: Record<string, string> = {
  disposable_email: 'Throwaway email address',
  random_email: 'Random-looking email address',
  shared_device: 'Phone shared with other accounts',
  listing_burst: 'Many listings in one day',
  new_account_expensive: 'New account selling expensive items',
  reports_received: 'Reported by other users',
  blocks_received: 'Blocked by other users',
};

const detailText = (details: Record<string, unknown>) =>
  Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');

const tabs: { status: RiskFlagStatus; label: string }[] = [
  { status: 'open', label: 'To review' },
  { status: 'actioned', label: 'Dealt with' },
  { status: 'dismissed', label: 'Dismissed' },
];

export function RiskFlagsPage() {
  const [params, setParams] = useSearchParams();
  const status = (tabs.find(t => t.status === params.get('status'))?.status ?? 'open') as RiskFlagStatus;
  const [review, setReview] = useState<{ flag: RiskFlag; status: 'dismissed' | 'actioned' } | null>(null);
  const queryClient = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['risk-flags', status],
    queryFn: () => api.get<RiskFlag[]>(`/admin/risk-flags?status=${status}`),
  });

  return (
    <div className="page">
      <h1>Suspicious accounts</h1>
      <p className="muted small">
        The checker flags an account when its signals add up to 40 points or more. It never acts on its own.
      </p>
      <div className="tabs" role="tablist">
        {tabs.map(t => (
          <button
            key={t.status}
            role="tab"
            aria-selected={status === t.status}
            className={`tab${status === t.status ? ' active' : ''}`}
            onClick={() => setParams(t.status === 'open' ? {} : { status: t.status })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <Loading />
      ) : isError ? (
        <Failed error={error} retry={refetch} />
      ) : !data.length ? (
        <p className="muted">{status === 'open' ? 'Nothing to review. 🎉' : 'None yet.'}</p>
      ) : (
        <div className="stack">
          {data.map(flag => (
            <article key={flag.id} className="card box">
              <div className="queue-head">
                <div>
                  <strong>
                    <Link to={`/users/${flag.user.id}`}>{flag.user.name}</Link>
                  </strong>{' '}
                  <Badge tone={flag.score >= 70 ? 'red' : 'amber'}>score {flag.score}</Badge>{' '}
                  {flag.user.suspended && <Badge tone="red">suspended</Badge>}
                  <div className="muted small">
                    {flag.user.email} · joined {when(flag.user.createdAt)} · flagged {when(flag.createdAt)}
                  </div>
                </div>
                {flag.status === 'open' && (
                  <div className="actions">
                    <button className="secondary" onClick={() => setReview({ flag, status: 'dismissed' })}>
                      Nothing wrong
                    </button>
                    <button className="secondary" onClick={() => setReview({ flag, status: 'actioned' })}>
                      I dealt with it
                    </button>
                  </div>
                )}
              </div>
              <ul className="plain signals">
                {flag.signals.map((s, i) => (
                  <li key={i}>
                    <span className="points">+{s.points}</span> {signalLabels[s.kind] ?? s.kind}
                    {detailText(s.details) && <span className="muted small"> · {detailText(s.details)}</span>}
                  </li>
                ))}
              </ul>
              {flag.aiSummary && <p className="quote">AI summary: {flag.aiSummary}</p>}
              {flag.status !== 'open' && (
                <p className="small muted">
                  {flag.status === 'dismissed' ? 'Dismissed' : 'Dealt with'} by {flag.reviewedBy?.name ?? 'a deleted admin'} ·{' '}
                  {when(flag.reviewedAt)}
                  {flag.reviewNote && <> · “{flag.reviewNote}”</>}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {review && (
        <ConfirmDialog
          title={review.status === 'dismissed' ? `Nothing wrong with ${review.flag.user.name}?` : `You dealt with ${review.flag.user.name}?`}
          body={
            review.status === 'dismissed' ? (
              <p>The flag is closed. The checker can flag the account again later if new signals come in.</p>
            ) : (
              <p>
                Say what you did (warned them, suspended them…). To suspend, use the{' '}
                <Link to={`/users/${review.flag.user.id}`}>account page</Link>: suspending closes this flag by itself.
              </p>
            )
          }
          inputLabel="Note (kept in the audit log)"
          confirmLabel={review.status === 'dismissed' ? 'Dismiss flag' : 'Close flag'}
          onConfirm={note =>
            api.post(`/admin/risk-flags/${review.flag.id}/review`, { status: review.status, note }).then(() => {
              queryClient.invalidateQueries({ queryKey: ['risk-flags'] });
              queryClient.invalidateQueries({ queryKey: ['stats'] });
            })
          }
          onClose={() => setReview(null)}
        />
      )}
    </div>
  );
}
