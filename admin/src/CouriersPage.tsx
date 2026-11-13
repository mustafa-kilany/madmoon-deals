// Courier (driver) accounts (BACKEND_PLAN B14.1): staff, never self sign-up. An
// admin adds one with a company email; the courier gets a code by email and
// chooses a password in the app. Disabling signs them out at once.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from './api';
import type { Courier } from './types';
import { Badge, ConfirmDialog, Failed, Loading, when } from './ui';

export function CouriersPage() {
  const queryClient = useQueryClient();
  const [toggle, setToggle] = useState<Courier | null>(null);
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['couriers'],
    queryFn: () => api.get<Courier[]>('/admin/couriers'),
  });
  const changed = () => {
    queryClient.invalidateQueries({ queryKey: ['couriers'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  return (
    <div className="page">
      <h1>Couriers</h1>
      {isPending ? (
        <Loading />
      ) : isError ? (
        <Failed error={error} retry={refetch} />
      ) : !data.length ? (
        <p className="muted">No couriers yet. Add the first one below.</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Added</th>
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="clip">{c.email}</td>
                  <td className="small">{when(c.createdAt)}</td>
                  <td>{c.active ? <Badge tone="green">active</Badge> : <Badge tone="grey">disabled</Badge>}</td>
                  <td>
                    <button className="secondary small-button" onClick={() => setToggle(c)}>
                      {c.active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewCourier onAdded={changed} />

      {toggle && (
        <ConfirmDialog
          title={toggle.active ? `Disable ${toggle.name}?` : `Enable ${toggle.name} again?`}
          body={
            toggle.active ? (
              <p>They are signed out at once and can’t log in. Reassign their open deliveries from the Orders page.</p>
            ) : (
              <p>They can log in again with their old password (or reset it from the app).</p>
            )
          }
          confirmLabel={toggle.active ? 'Disable' : 'Enable'}
          danger={toggle.active}
          onConfirm={() => api.post(`/admin/couriers/${toggle.id}/${toggle.active ? 'disable' : 'enable'}`).then(changed)}
          onClose={() => setToggle(null)}
        />
      )}
    </div>
  );
}

function NewCourier({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const courier = await api.post<Courier>('/admin/couriers', { name: form.name.trim(), email: form.email.trim() });
      setAdded(courier.email);
      setForm({ name: '', email: '' });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card box narrow-form">
      <h2>Add a courier</h2>
      <form onSubmit={submit}>
        <label>
          Name
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required minLength={2} />
        </label>
        <label>
          Company email
          <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@sahla.jo" required />
        </label>
        {error && <p className="error">{error}</p>}
        {added && (
          <p className="success">
            Added. {added} gets a code by email: in the app they tap “Forgot password”, enter it and choose a password.
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add courier'}
        </button>
      </form>
    </section>
  );
}
