// The owner's Admins page (BACKEND_PLAN B15.7): who can use the dashboard and
// what each type may do. Add an admin with a company email (they get a code by
// email, choose a password, and set up the authenticator on their first
// log-in), change their type, disable or enable. You can't change yourself.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from './api';
import { useSession } from './session';
import type { AdminRole, AdminRow } from './types';
import { Badge, ConfirmDialog, Failed, Loading, when } from './ui';

export const ADMIN_TYPES: { role: AdminRole; label: string; does: string }[] = [
  { role: 'owner', label: 'Owner', does: 'Everything, and manages admins.' },
  { role: 'operations', label: 'Operations', does: 'Orders, drivers, delivery problems (try again), stores, category pictures.' },
  { role: 'support', label: 'Support', does: 'Support chat, reports, suspicious accounts, certificates, suspending users, delivery problems (try again).' },
  { role: 'finance', label: 'Finance', does: 'Refunds, payouts, analytics. Orders read-only.' },
];
const typeLabel = (role: AdminRole | null) => ADMIN_TYPES.find(t => t.role === role)?.label ?? 'No type';

export function AdminsPage() {
  const { admin: me } = useSession();
  const queryClient = useQueryClient();
  const [toggle, setToggle] = useState<AdminRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, isPending, isError, error: loadError, refetch } = useQuery({
    queryKey: ['admins'],
    queryFn: () => api.get<AdminRow[]>('/admin/admins'),
  });
  const changed = () => queryClient.invalidateQueries({ queryKey: ['admins'] });
  const setRole = async (a: AdminRow, adminRole: AdminRole) => {
    setError(null);
    try {
      await api.post(`/admin/admins/${a.id}/role`, { adminRole });
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t change it');
    }
  };

  return (
    <div className="page">
      <h1>Admins</h1>
      <section className="card box">
        <h2>Admin types</h2>
        <dl>
          {ADMIN_TYPES.map(t => (
            <div key={t.role}>
              <dt>{t.label}</dt>
              <dd>{t.does}</dd>
            </div>
          ))}
        </dl>
      </section>
      {error && <p className="error">{error}</p>}
      {isPending ? (
        <Loading />
      ) : isError ? (
        <Failed error={loadError} retry={refetch} />
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>Authenticator</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map(a => {
                const self = a.id === me?.id;
                return (
                  <tr key={a.id}>
                    <td>
                      {a.name} {self && <span className="muted small">(you)</span>}
                    </td>
                    <td className="clip">{a.email}</td>
                    <td>
                      {self ? (
                        typeLabel(a.adminRole)
                      ) : (
                        <select value={a.adminRole ?? ''} aria-label={`Type of ${a.name}`} onChange={e => setRole(a, e.target.value as AdminRole)}>
                          {!a.adminRole && <option value="">No type</option>}
                          {ADMIN_TYPES.map(t => (
                            <option key={t.role} value={t.role}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{a.twoFactor ? <Badge tone="green">set up</Badge> : <Badge tone="amber">on first log-in</Badge>}</td>
                    <td className="small">{when(a.createdAt)}</td>
                    <td>
                      {!self && (
                        <button className="secondary small-button" onClick={() => setToggle(a)}>
                          {a.active ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <NewAdmin onAdded={changed} />

      {toggle && (
        <ConfirmDialog
          title={toggle.active ? `Disable ${toggle.name}?` : `Enable ${toggle.name} again?`}
          body={<p>{toggle.active ? 'They are signed out of the dashboard at once and can’t log in.' : 'They can log in again.'}</p>}
          confirmLabel={toggle.active ? 'Disable' : 'Enable'}
          danger={toggle.active}
          onConfirm={() => api.post(`/admin/admins/${toggle.id}/${toggle.active ? 'disable' : 'enable'}`).then(changed)}
          onClose={() => setToggle(null)}
        />
      )}
    </div>
  );
}

function NewAdmin({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState<{ name: string; email: string; adminRole: AdminRole }>({ name: '', email: '', adminRole: 'support' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const admin = await api.post<AdminRow>('/admin/admins', { ...form, name: form.name.trim(), email: form.email.trim() });
      setAdded(admin.email);
      setForm({ name: '', email: '', adminRole: 'support' });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card box narrow-form">
      <h2>Add an admin</h2>
      <form onSubmit={submit}>
        <label>
          Name
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required minLength={2} />
        </label>
        <label>
          Company email
          <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@sahla.jo" required />
        </label>
        <label>
          Type
          <select value={form.adminRole} onChange={e => setForm({ ...form, adminRole: e.target.value as AdminRole })}>
            {ADMIN_TYPES.map(t => (
              <option key={t.role} value={t.role}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        {added && <p className="success">Added. {added} gets a code by email to choose a password, then sets up the authenticator on their first log-in.</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add admin'}
        </button>
      </form>
    </section>
  );
}
