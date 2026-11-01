// Certified Refurbished (BACKEND_PLAN B8.4): the brands' stores, their API keys,
// uploading a store's sheet with a preview first, and what each import did.
// The sheet's columns: docs/refurbished-import-template.csv.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from './api';
import type { ImportResult, ImportRun, Store, StoreKey } from './types';
import { Badge, ConfirmDialog, Failed, Loading, when } from './ui';

export function RefurbishedPage() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.get<Store[]>('/admin/refurbished/stores'),
  });
  return (
    <div className="page">
      <h1>Certified Refurbished</h1>
      <p className="muted small">
        Each brand sells from its own store. Upload a store’s stock sheet, or give the brand an API key so its own system sends the stock.
      </p>
      {isPending ? (
        <Loading />
      ) : isError ? (
        <Failed error={error} retry={refetch} />
      ) : !data.length ? (
        <p className="muted">No stores yet. Create the first one below.</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>Id</th>
                <th className="num">On sale</th>
                <th>Last import</th>
                <th>API keys</th>
              </tr>
            </thead>
            <tbody>
              {data.map(s => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/refurbished/${s.id}`}>{s.nameEn}</Link> <span className="muted">· {s.nameAr}</span>
                  </td>
                  <td className="small">{s.id}</td>
                  <td className="num">{s.onSale}</td>
                  <td className="small">{when(s.lastImportAt)}</td>
                  <td className="small">{s.keys.filter(k => !k.revokedAt).length} active</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewStore />
    </div>
  );
}

function NewStore() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ id: 'store-', nameEn: '', nameAr: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/refurbished/stores', form);
      setForm({ id: 'store-', nameEn: '', nameAr: '' });
      queryClient.invalidateQueries({ queryKey: ['stores'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card box narrow-form">
      <h2>New store</h2>
      <form onSubmit={submit}>
        <label>
          Id (shown in links, can’t change later)
          <input value={form.id} onChange={e => setForm({ ...form, id: e.target.value.toLowerCase() })} pattern="store-[a-z0-9-]{2,40}" required />
        </label>
        <label>
          Name in English
          <input value={form.nameEn} onChange={e => setForm({ ...form, nameEn: e.target.value })} placeholder="Apple Certified" required minLength={2} />
        </label>
        <label>
          Name in Arabic
          <input dir="rtl" value={form.nameAr} onChange={e => setForm({ ...form, nameAr: e.target.value })} placeholder="آبل المعتمد" required minLength={2} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create store'}
        </button>
      </form>
    </section>
  );
}

export function StorePage() {
  const id = useParams().id!;
  const { data: stores, isPending, isError, error, refetch } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.get<Store[]>('/admin/refurbished/stores'),
  });
  if (isPending) return <div className="page"><Loading /></div>;
  if (isError) return <div className="page"><Failed error={error} retry={refetch} /></div>;
  const store = stores.find(s => s.id === id);
  if (!store)
    return (
      <div className="page">
        <p className="small"><Link to="/refurbished">← Certified Refurbished</Link></p>
        <p className="muted">No store {id}.</p>
      </div>
    );
  return (
    <div className="page">
      <p className="small">
        <Link to="/refurbished">← Certified Refurbished</Link>
      </p>
      <h1>
        {store.nameEn} <span className="muted">· {store.nameAr}</span>
      </h1>
      <p className="muted">
        {store.id} · {store.onSale} on sale · created {when(store.createdAt)}
      </p>
      <UploadSheet storeId={store.id} />
      <Keys store={store} />
      <ImportHistory storeId={store.id} />
    </div>
  );
}

const modes = {
  upsert: 'Add and update: rows add new items or change existing ones (by sku). Nothing else changes.',
  replace: 'Whole stock: the sheet is everything the store has. Its items missing from the sheet come off sale.',
};

function UploadSheet({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [mode, setMode] = useState<'upsert' | 'replace'>('upsert');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const pick = async (picked: File | undefined) => {
    setResult(null);
    setError(null);
    setFile(null);
    if (!picked) return;
    if (!/\.csv$/i.test(picked.name)) {
      setError('Upload the sheet as CSV: in Excel, File → Save As → “CSV UTF-8 (Comma delimited)”.');
      return;
    }
    if (picked.size > 4_500_000) {
      setError('The file is too big (at most about 4 MB, 1000 rows). Split it into several sheets.');
      return;
    }
    setFile({ name: picked.name, csv: await picked.text() });
  };
  const send = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const done = await api.post<ImportResult>(`/admin/refurbished/stores/${storeId}/import`, { csv: file.csv, mode, dryRun });
      setResult(done);
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ['stores'] });
        queryClient.invalidateQueries({ queryKey: ['imports', storeId] });
        queryClient.invalidateQueries({ queryKey: ['actions', 'store', storeId] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setResult(null);
    } finally {
      setBusy(false);
    }
  };
  const skipped = result ? new Set(result.errors.map(e => e.row)).size : 0;

  return (
    <section className="card box">
      <h2>Upload the stock sheet</h2>
      <p className="small muted">
        Use the template’s columns (<code>docs/refurbished-import-template.csv</code>). In Excel save it as “CSV UTF-8”: plain “CSV” breaks the
        Arabic. Check it first with Preview: nothing is saved until you publish.
      </p>
      <div className="toolbar">
        <input type="file" accept=".csv,text/csv" onChange={e => pick(e.target.files?.[0])} aria-label="Stock sheet (CSV)" />
        <select
          value={mode}
          onChange={e => {
            setMode(e.target.value as 'upsert' | 'replace');
            setResult(null);
          }}
          aria-label="Import mode"
        >
          <option value="upsert">Add and update</option>
          <option value="replace">Whole stock (replace)</option>
        </select>
        <button className="secondary" disabled={!file || busy} onClick={() => send(true)}>
          {busy ? 'Checking…' : 'Preview'}
        </button>
        <button className="danger" disabled={!result?.dryRun || busy || result.created + result.updated + result.withdrawn === 0} onClick={() => setConfirming(true)}>
          Publish
        </button>
      </div>
      <p className="small muted">{modes[mode]}</p>
      {error && <p className="error">{error}</p>}

      {result && (
        <div className={result.dryRun ? 'note' : 'success'}>
          <strong>{result.dryRun ? `Preview of ${file?.name}` : 'Published'}:</strong> {result.rows} rows ·{' '}
          {result.dryRun ? 'would add' : 'added'} {result.created} · {result.dryRun ? 'would update' : 'updated'} {result.updated}
          {mode === 'replace' && <> · {result.dryRun ? 'would take off sale' : 'took off sale'} {result.withdrawn}</>}
          {skipped > 0 && <> · <strong>{skipped} rows skipped</strong> (fix them below and upload again)</>}
        </div>
      )}
      {result && result.errors.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Excel row</th>
                <th>sku</th>
                <th>Column</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {result.errors.map((e, i) => (
                <tr key={i}>
                  <td className="num">{e.row + 1}</td>
                  <td className="small">{e.sku ?? '—'}</td>
                  <td className="small">{e.field}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirming && result && (
        <ConfirmDialog
          title="Publish this sheet?"
          body={
            <p>
              {result.created} new items go on sale and {result.updated} change
              {mode === 'replace' && result.withdrawn > 0 && (
                <>
                  , and <strong>{result.withdrawn} items come off sale</strong> because they aren’t in the sheet
                </>
              )}
              . {skipped > 0 && `${skipped} rows with problems are skipped.`}
            </p>
          }
          confirmLabel="Publish"
          danger={mode === 'replace' && result.withdrawn > 0}
          onConfirm={() => send(false)}
          onClose={() => setConfirming(false)}
        />
      )}
    </section>
  );
}

function Keys({ store }: { store: Store }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [newKey, setNewKey] = useState<(StoreKey & { key: string }) | null>(null);
  const [revoking, setRevoking] = useState<StoreKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['stores'] });
    queryClient.invalidateQueries({ queryKey: ['actions', 'store', store.id] });
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      setNewKey(await api.post<StoreKey & { key: string }>(`/admin/refurbished/stores/${store.id}/keys`, { label: label.trim() }));
      setLabel('');
      setCopied(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  return (
    <section className="card box">
      <h2>API keys</h2>
      <p className="small muted">
        For the brand’s own stock system: it sends the stock to <code>POST /v1/admin/refurbished/import</code> (docs/API.md). Each key only
        works for this store. Revoke a key the moment it may have leaked.
      </p>
      {store.keys.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Made</th>
                <th>Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {store.keys.map(k => (
                <tr key={k.id}>
                  <td>{k.label}</td>
                  <td className="small">{when(k.createdAt)}</td>
                  <td className="small">{k.lastUsedAt ? when(k.lastUsedAt) : 'never'}</td>
                  <td>
                    {k.revokedAt ? (
                      <Badge tone="grey">revoked {when(k.revokedAt)}</Badge>
                    ) : (
                      <button className="secondary small-button" onClick={() => setRevoking(k)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="toolbar" onSubmit={create}>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Name, e.g. “Apple stock system”" minLength={2} required aria-label="Key name" />
        <button className="secondary">Make a key</button>
      </form>
      {error && <p className="error">{error}</p>}

      {newKey && (
        <div className="overlay" role="presentation">
          <div className="card dialog" role="dialog" aria-modal="true" aria-label="The new API key">
            <h2 className="dialog-title">Copy the key now</h2>
            <div className="dialog-body">
              <p>
                This is the only time it is shown. Send it to the brand over a safe channel (not plain email). If it’s lost, revoke it and make a
                new one.
              </p>
              <code className="secret">{newKey.key}</code>
            </div>
            <div className="dialog-buttons">
              <button
                className="secondary"
                onClick={() => navigator.clipboard.writeText(newKey.key).then(() => setCopied(true), () => setCopied(false))}
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
              <button className="primary" onClick={() => setNewKey(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {revoking && (
        <ConfirmDialog
          title={`Revoke “${revoking.label}”?`}
          body={<p>The brand’s system stops working with this key at once. This can’t be undone.</p>}
          confirmLabel="Revoke key"
          danger
          onConfirm={() => api.post(`/admin/refurbished/stores/${store.id}/keys/${revoking.id}/revoke`).then(refresh)}
          onClose={() => setRevoking(null)}
        />
      )}
    </section>
  );
}

function ImportHistory({ storeId }: { storeId: string }) {
  const { data } = useQuery({
    queryKey: ['imports', storeId],
    queryFn: () => api.get<ImportRun[]>(`/admin/refurbished/stores/${storeId}/imports`),
  });
  return (
    <section className="card box">
      <h2>Import history</h2>
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <p className="muted small">No imports yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>By</th>
                <th>Mode</th>
                <th className="num">Added</th>
                <th className="num">Updated</th>
                <th className="num">Off sale</th>
                <th className="num">Rows skipped</th>
              </tr>
            </thead>
            <tbody>
              {data.map(run => (
                <tr key={run.id}>
                  <td className="small">{when(run.createdAt)}</td>
                  <td className="small">{run.source}</td>
                  <td className="small">{run.mode === 'replace' ? 'Whole stock' : 'Add and update'}</td>
                  <td className="num">{run.created}</td>
                  <td className="num">{run.updated}</td>
                  <td className="num">{run.withdrawn}</td>
                  <td className="num">{new Set(run.errors.map(e => e.row)).size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
