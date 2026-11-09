import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Express, Request } from 'express';
import { randomUUID } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import pg from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import { prisma } from '../../db';
import { env } from '../../env';
import { logger } from '../../lib/logger';
import type { Prisma } from '../../generated/prisma/client';
import type { toApiBid } from './shapes';

// Live auctions: GET /v1/listings/:id/live opens a WebSocket that gets each new bid as it's saved.
// A bid is announced with Postgres NOTIFY inside its own transaction, so only saved bids go out, in
// the order they were saved, and every server hears them. Everything sent is what the public
// GET /listings/:id/bids already shows, so no log-in is needed and nobody can send anything.
// The app keeps a slow poll too, and polls quickly whenever this connection is down: if this
// breaks, bids show more slowly but never wrongly.

const BIDS_CHANNEL = 'sahla_bids';
const PING_CHANNEL = 'sahla_live_ping';
const NOTIFY_MAX_BYTES = 7900; // Postgres refuses more than 8000, which would fail the bid itself
const SEND_BUFFER_MAX = 1024 * 1024;
const RETRY_MAX_MS = 30_000;

/** Inside the bid's transaction: a bid that doesn't save is never announced. */
export async function announceBid(tx: Prisma.TransactionClient, bid: ReturnType<typeof toApiBid>) {
  const payload = JSON.stringify({ type: 'bid', bid });
  if (Buffer.byteLength(payload) > NOTIFY_MAX_BYTES) return; // can't happen with today's names; the poll would still show it
  await tx.$executeRaw`SELECT pg_notify(${BIDS_CHANNEL}::text, ${payload}::text)`;
}

export type LiveOptions = {
  maxPerAddress: number;
  maxTotal: number;
  connectsPerMinute: number;
  heartbeatMs: number;
};

// An upgrade skips Express, so the API's flood fence doesn't apply and these are its own. An address
// can be a whole mobile carrier, so per-address limits are high. Measured: 1 000 sockets add about
// 220 MB to this server. Past the total, phones just poll, which beats running out of memory.
const DEFAULTS: LiveOptions = {
  maxPerAddress: 1000 * env.RATE_LIMIT_MULTIPLIER,
  maxTotal: env.LIVE_MAX_CONNECTIONS,
  connectsPerMinute: 600 * env.RATE_LIMIT_MULTIPLIER,
  heartbeatMs: 25_000,
};

const REASONS: Record<number, string> = { 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests', 503: 'Service Unavailable' };
const refuse = (socket: Duplex, status: number) => {
  // Destroyed, not just ended: whoever is on the other side doesn't get to keep it half open.
  socket.end(`HTTP/1.1 ${status} ${REASONS[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () => socket.destroy());
};

/** Browsers send an Origin nobody can fake, so another website can't use up connections. The phone app's is the API's own address. */
function originAllowed(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const { host } = new URL(origin);
    return host === req.headers.host || (!!env.PUBLIC_URL && host === new URL(env.PUBLIC_URL).host);
  } catch {
    return false;
  }
}

/** Starts listening for bids and serving sockets on this server. `close()` before the server closes. */
export function attachLive(server: Server, app: Express, options: Partial<LiveOptions> = {}) {
  const limits = { ...DEFAULTS, ...options };
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64, perMessageDeflate: false, clientTracking: false });
  const watchers = new Map<string, Set<WebSocket>>();
  const sockets = new Set<WebSocket>();
  const alive = new WeakSet<WebSocket>();
  const perAddress = new Map<string, number>();
  const connects = new Map<string, { windowStart: number; count: number }>();

  let total = 0; // sockets plus connections still being checked
  let stopped = false;
  let listener: pg.Client | undefined;
  let listening = false;
  let retryMs = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingSent: string | undefined;

  const release = (address: string) => {
    total--;
    const left = (perAddress.get(address) ?? 1) - 1;
    if (left > 0) perAddress.set(address, left);
    else perAddress.delete(address);
  };

  const closeAll = (code: number, reason: string) => {
    for (const ws of sockets) ws.close(code, reason);
  };

  // ── Hearing the bids ──
  const onNotification = (message: pg.Notification) => {
    if (message.channel === PING_CHANNEL) {
      if (message.payload === pingSent) pingSent = undefined;
      return;
    }
    try {
      const itemId = (JSON.parse(message.payload ?? '') as { bid: { itemId: string } }).bid.itemId;
      for (const ws of watchers.get(itemId) ?? []) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        // A phone that stopped reading must not grow this server's memory.
        if (ws.bufferedAmount > SEND_BUFFER_MAX) ws.terminate();
        else ws.send(message.payload!);
      }
    } catch (error) {
      logger.error({ err: error }, 'Live: bad bid announcement');
    }
  };

  // Connections drop: bids announced meanwhile would never come, so the phones go back to
  // polling (and catch up when they reconnect) until this works again.
  const onDown = (client: pg.Client) => {
    if (listener !== client) return;
    listener = undefined;
    listening = false;
    pingSent = undefined;
    client.end().catch(() => {});
    if (stopped) return;
    closeAll(1013, 'try again');
    retryTimer = setTimeout(() => void listen(), retryMs);
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
  };

  const listen = async () => {
    // A connection pooler in transaction mode can't LISTEN: docs/DEPLOY.md (LIVE_DATABASE_URL).
    const client = new pg.Client({ connectionString: env.LIVE_DATABASE_URL ?? env.DATABASE_URL, keepAlive: true });
    listener = client;
    client.on('error', error => {
      logger.warn({ err: error }, 'Live: lost the database');
      onDown(client);
    });
    client.on('end', () => onDown(client));
    client.on('notification', onNotification);
    try {
      await client.connect();
      await client.query(`LISTEN ${BIDS_CHANNEL}`);
      await client.query(`LISTEN ${PING_CHANNEL}`);
      if (stopped) return void client.end().catch(() => {});
      listening = true;
    } catch (error) {
      logger.warn({ err: error }, 'Live: can’t listen');
      onDown(client);
    }
  };
  void listen();

  // ── Keeping it honest ──
  const heartbeat = setInterval(() => {
    // Phones: one that stopped answering is gone. "alive" lets the phone notice the reverse.
    for (const ws of sockets) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
      ws.send('{"type":"alive"}');
    }
    // Old rate-limit windows, so the map can't grow forever.
    const now = Date.now();
    for (const [address, entry] of connects) if (now - entry.windowStart >= 60_000) connects.delete(address);
    // The database: a connection can die silently, or sit behind a pooler that never delivers.
    // It must hear its own message, or the app would wait for bids that never come.
    if (!listening || !listener) return;
    if (pingSent) {
      logger.error('Live: the database stopped delivering bids, reconnecting');
      retryMs = Math.max(retryMs, limits.heartbeatMs);
      onDown(listener);
      return;
    }
    retryMs = 1000;
    const token = randomUUID();
    pingSent = token;
    prisma.$executeRaw`SELECT pg_notify(${PING_CHANNEL}::text, ${token}::text)`.catch(() => {
      if (pingSent === token) pingSent = undefined; // the database is busy or away: says nothing about the listener
    });
  }, limits.heartbeatMs);
  (heartbeat as unknown as { unref(): void }).unref();

  // ── Letting phones in ──
  const accept = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const match = /^\/v1\/listings\/([\w-]{1,128})\/live$/.exec(req.url?.split('?')[0] ?? '');
    if (!match || req.method !== 'GET' || req.headers.upgrade?.toLowerCase() !== 'websocket') return refuse(socket, 404);
    if (!originAllowed(req)) return refuse(socket, 403);

    // What Express does for its own requests, so req.ip follows TRUST_PROXY the same way.
    Object.setPrototypeOf(req, app.request);
    const address = ipKeyGenerator((req as Request).ip ?? '');

    const now = Date.now();
    let rate = connects.get(address);
    if (!rate || now - rate.windowStart >= 60_000) {
      rate = { windowStart: now, count: 0 };
      connects.set(address, rate);
    }
    if (++rate.count > limits.connectsPerMinute) return refuse(socket, 429);
    if (stopped || !listening || total >= limits.maxTotal || (perAddress.get(address) ?? 0) >= limits.maxPerAddress) return refuse(socket, 503);

    // Counted before the database lookup, so a burst can't pass the limits together.
    total++;
    perAddress.set(address, (perAddress.get(address) ?? 0) + 1);
    let handedOver = false;
    try {
      const listingId = match[1];
      const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { saleType: true, status: true } });
      if (!listing || listing.status === 'withdrawn' || listing.saleType !== 'auction') return refuse(socket, 404);
      if (stopped || !listening) return refuse(socket, 503);

      handedOver = true;
      let opened = false;
      wss.handleUpgrade(req, socket, head, ws => {
        opened = true;
        const room = watchers.get(listingId) ?? new Set<WebSocket>();
        watchers.set(listingId, room);
        room.add(ws);
        sockets.add(ws);
        alive.add(ws);
        ws.on('pong', () => alive.add(ws));
        ws.on('message', () => ws.close(1008, 'nothing to send here')); // this connection only goes one way
        ws.on('error', () => ws.terminate());
        ws.on('close', () => {
          room.delete(ws);
          if (!room.size && watchers.get(listingId) === room) watchers.delete(listingId);
          sockets.delete(ws);
          release(address);
        });
      });
      // A bad handshake, or the phone left during the lookup: the 'close' above will never run.
      if (!opened) {
        if (socket.destroyed) release(address);
        else socket.once('close', () => release(address));
      }
    } finally {
      if (!handedOver) release(address);
    }
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => socket.destroy());
    accept(req, socket, head).catch(error => {
      logger.error({ err: error }, 'Live: refused a connection');
      refuse(socket, 503);
    });
  };
  server.on('upgrade', onUpgrade);

  return {
    /** Phones reconnect to another server, and catch up when they do. */
    close() {
      stopped = true;
      server.off('upgrade', onUpgrade);
      clearInterval(heartbeat);
      clearTimeout(retryTimer);
      closeAll(1001, 'server restarting');
      const client = listener;
      listener = undefined;
      listening = false;
      client?.end().catch(() => {});
    },
    stats: () => ({ sockets: sockets.size, total, listening }),
    /** Tests only: the connection hearing the bids, to break it. */
    listenerForTests: () => listener,
  };
}
