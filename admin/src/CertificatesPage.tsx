// Test certificates whose shop stamp nobody has checked yet (BACKEND_PLAN B4.3 →
// B8.3). The text checks passed; there is no stamp detector yet, so an admin
// looks at the original photo: approve, or reject (the listing comes off sale,
// the seller gets a push, and the same paper can't be used again).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from './api';
import type { CertificateToCheck } from './types';
import { Badge, ConfirmDialog, Failed, jod, Loading, PrivateImage, when } from './ui';

export function CertificatesPage() {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<{ kind: 'approve' | 'reject'; certificate: CertificateToCheck } | null>(null);
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['certificates'],
    queryFn: () => api.get<CertificateToCheck[]>('/admin/certificates'),
  });
  const changed = () => {
    queryClient.invalidateQueries({ queryKey: ['certificates'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  return (
    <div className="page">
      <h1>Test certificates</h1>
      <p className="muted small">
        Check that the paper has a real testing shop’s stamp and that it matches the device being sold. The oldest come first: they have been
        on sale the longest.
      </p>

      {isPending ? (
        <Loading />
      ) : isError ? (
        <Failed error={error} retry={refetch} />
      ) : !data.length ? (
        <p className="muted">Nothing to check. 🎉</p>
      ) : (
        <div className="stack">
          {data.map(c => {
            const paid = c.listing?.status === 'reserved';
            return (
              <article key={c.id} className="card box">
                <div className="queue-head">
                  <div className="item">
                    {c.listing?.imageUrl && <img src={c.listing.imageUrl} alt="" />}
                    <div>
                      <strong>{c.listing?.title ?? 'No listing'}</strong>{' '}
                      {paid && <Badge tone="amber">paid, waiting for delivery</Badge>}
                      <div className="muted small">
                        {c.listing && <>{jod(c.listing.priceFils)} · </>}
                        uploaded {when(c.createdAt)} · seller <Link to={`/users/${c.seller.id}`}>{c.seller.name}</Link>
                      </div>
                    </div>
                  </div>
                  <div className="actions">
                    <button className="secondary" onClick={() => setDecision({ kind: 'approve', certificate: c })}>
                      Stamp is fine
                    </button>
                    <button
                      className="danger"
                      disabled={paid}
                      title={paid ? 'Paid for: refund the order first' : undefined}
                      onClick={() => setDecision({ kind: 'reject', certificate: c })}
                    >
                      Reject
                    </button>
                  </div>
                </div>
                <div className="certificate">
                  <div>
                    <PrivateImage path={`/admin/certificates/${c.id}/photo`} alt="The original certificate photo" />
                    <p className="muted small">
                      The original (IMEI visible: admins only).{' '}
                      {c.blurredUrl && (
                        <a href={c.blurredUrl} target="_blank" rel="noreferrer">
                          What buyers see
                        </a>
                      )}
                    </p>
                  </div>
                  <dl>
                    <dt>Seller chose</dt>
                    <dd>
                      {c.device.brand} {c.device.model ?? ''} <span className="muted">({c.device.type})</span>
                    </dd>
                    <dt>Paper says</dt>
                    <dd>{c.read.device ?? '—'}</dd>
                    <dt>Shop</dt>
                    <dd>{c.read.shopName ?? '—'}</dd>
                    <dt>Shop phone</dt>
                    <dd>{c.read.shopPhone ?? '—'}</dd>
                    <dt>Tested on</dt>
                    <dd>{c.read.testedAt ? new Date(c.read.testedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—'}</dd>
                    <dt>Specs</dt>
                    <dd>{c.read.specs.length ? c.read.specs.join(' · ') : '—'}</dd>
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {decision?.kind === 'approve' && (
        <ConfirmDialog
          title="The stamp is fine?"
          body={<p>The certificate leaves this queue and the listing stays on sale.</p>}
          confirmLabel="Approve"
          onConfirm={() => api.post(`/admin/certificates/${decision.certificate.id}/approve`).then(changed)}
          onClose={() => setDecision(null)}
        />
      )}
      {decision?.kind === 'reject' && (
        <ConfirmDialog
          title="Reject this certificate?"
          body={
            <p>
              The listing comes off sale and the seller gets a notification. The same paper (photo or IMEI) can’t be used on a new listing.
            </p>
          }
          inputLabel="What’s wrong (kept in the audit log)"
          confirmLabel="Reject and remove listing"
          danger
          onConfirm={reason => api.post(`/admin/certificates/${decision.certificate.id}/reject`, { reason }).then(changed)}
          onClose={() => setDecision(null)}
        />
      )}
    </div>
  );
}
