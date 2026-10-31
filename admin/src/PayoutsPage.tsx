// Sellers' money after delivery (GET /admin/payouts). Until the payment
// provider pays sellers itself (D2), an admin sends a bank transfer and marks
// the payout sent here with the bank's reference.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from './api';
import type { Payout } from './types';
import { ConfirmDialog, Failed, jod, Loading, when } from './ui';

export function PayoutsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') === 'paid' ? 'paid' : 'pending';
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState<Payout | null>(null);
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['payouts', status],
    queryFn: () => api.get<Payout[]>(`/admin/payouts?status=${status}&limit=100`),
  });
  const total = data?.reduce((sum, p) => sum + p.amountFils, 0) ?? 0;

  return (
    <div className="page wide">
      <h1>Payouts</h1>
      <div className="tabs" role="tablist">
        {(['pending', 'paid'] as const).map(s => (
          <button key={s} role="tab" aria-selected={status === s} className={status === s ? 'tab active' : 'tab'} onClick={() => setParams(s === 'paid' ? { status: s } : {})}>
            {s === 'pending' ? 'To send' : 'Sent'}
          </button>
        ))}
      </div>
      {status === 'pending' && data?.length ? (
        <p className="muted">
          {data.length} payouts, {jod(total)} in all. Oldest first: send them in this order.
        </p>
      ) : null}

      {isPending ? (
        <Loading />
      ) : isError ? (
        <Failed error={error} retry={refetch} />
      ) : !data.length ? (
        <p className="muted">{status === 'pending' ? 'Nothing to send.' : 'No payouts sent yet.'}</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Seller</th>
                <th>Order</th>
                <th>Item</th>
                <th className="num">Amount</th>
                <th>{status === 'pending' ? 'Delivered' : 'Sent'}</th>
                {status === 'pending' && <th />}
              </tr>
            </thead>
            <tbody>
              {data.map(p => (
                <tr key={p.id}>
                  <td className="clip">
                    {p.seller?.email ? <Link to={`/users/${p.seller.id}`}>{p.seller.name}</Link> : (p.seller?.name ?? <span className="muted">deleted account</span>)}
                  </td>
                  <td>
                    <Link to={`/orders/${p.orderId}`}>{p.orderId}</Link>
                  </td>
                  <td className="clip">{p.itemTitle}</td>
                  <td className="num">{jod(p.amountFils)}</td>
                  <td className="small">{when(status === 'pending' ? p.createdAt : p.paidAt)}</td>
                  {status === 'pending' && (
                    <td>
                      <button className="secondary" onClick={() => setPaying(p)}>
                        Mark sent
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paying && (
        <ConfirmDialog
          title={`Mark ${jod(paying.amountFils)} to ${paying.seller?.name ?? 'the seller'} as sent?`}
          body={<p>Do this after the bank transfer went out. The bank’s reference is kept in the order’s history.</p>}
          inputLabel="Bank transfer reference"
          confirmLabel="Mark sent"
          onConfirm={reference =>
            api.post(`/admin/payouts/${paying.id}/paid`, { reference }).then(() => {
              queryClient.invalidateQueries({ queryKey: ['payouts'] });
              queryClient.invalidateQueries({ queryKey: ['stats'] });
            })
          }
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}
