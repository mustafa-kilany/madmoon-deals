// The support chat (BACKEND_PLAN B15.6): conversations with customers and
// drivers on the left (open ones first; "waiting" = they wrote since we last
// looked), the chosen one on the right. Answers are pushed to the person's phone
// as "Madmoon Deals support"; Close moves it off the open list until they write again.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from './api';
import type { SupportThread, SupportThreadRow } from './types';
import { Badge, Failed, Loading, when } from './ui';

const POLL_MS = 10_000;

export function SupportPage() {
  const userId = useParams().userId;
  const [onlyOpen, setOnlyOpen] = useState(true);
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['support', onlyOpen],
    queryFn: () => api.get<SupportThreadRow[]>(`/admin/support${onlyOpen ? '?open=true' : ''}`),
    refetchInterval: POLL_MS,
  });

  return (
    <div className="page wide">
      <h1>Support chat</h1>
      <div className="support">
        <section className="card box support-list">
          <label className="small">
            <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} /> Open only
          </label>
          {isPending ? (
            <Loading />
          ) : isError ? (
            <Failed error={error} retry={refetch} />
          ) : !data.length ? (
            <p className="muted">No conversations{onlyOpen && ' open'}.</p>
          ) : (
            <ul className="plain">
              {data.map(t => (
                <li key={t.userId} className={t.userId === userId ? 'selected' : ''}>
                  <Link to={`/support/${t.userId}`}>
                    <strong>{t.user.name}</strong> {t.user.role === 'courier' && <Badge tone="grey">driver</Badge>}{' '}
                    {t.waiting && <Badge tone="red">waiting</Badge>} {!t.open && <Badge tone="grey">closed</Badge>}
                    <div className="small muted clip">{t.lastMessage?.text}</div>
                    <div className="small muted">{when(t.lastMessageAt)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        {userId ? <Conversation userId={userId} /> : <p className="muted">Choose a conversation.</p>}
      </div>
    </div>
  );
}

function Conversation({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const { data, isPending, isError, error: loadError, refetch } = useQuery({
    queryKey: ['support', 'thread', userId],
    queryFn: () => api.get<SupportThread>(`/admin/support/${encodeURIComponent(userId)}`),
    refetchInterval: POLL_MS,
  });
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [data?.messages.length]);
  const changed = () => {
    queryClient.invalidateQueries({ queryKey: ['support'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  if (isPending) return <Loading />;
  if (isError) return <Failed error={loadError} retry={refetch} />;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/support/${encodeURIComponent(userId)}/messages`, { text: text.trim() });
      setText('');
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card box support-thread">
      <div className="page-head">
        <h2>
          {data.user.email ? <Link to={`/users/${data.user.id}`}>{data.user.name}</Link> : data.user.name}{' '}
          <span className="muted small">{data.user.email}</span>
        </h2>
        {data.open && (
          <button
            className="secondary"
            onClick={() =>
              api.post(`/admin/support/${encodeURIComponent(userId)}/close`).then(() => {
                changed();
                navigate('/support');
              })
            }
          >
            Close
          </button>
        )}
      </div>
      <div className="messages">
        {data.messages.map(m => (
          <div key={m.id} className={m.fromSupport ? 'message ours' : 'message theirs'}>
            <div>{m.text}</div>
            <div className="small muted">
              {m.fromSupport ? (m.senderName ?? 'Support') : data.user.name} · {when(m.createdAt)}
              {m.orderId && (
                <>
                  {' · '}
                  <Link to={`/orders/${m.orderId}`}>{m.orderId}</Link>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="toolbar" onSubmit={send}>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Answer as Madmoon Deals support…" maxLength={2000} rows={3} required />
        <button className="primary" disabled={busy || !text.trim()}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
