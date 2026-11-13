// A small round-robin load balancer, for the two-server test only (npm run balancer-test,
// docs/LOAD_BALANCER_TEST_PLAN.md). Production uses the host's own balancer: never this.
//
//   node --import tsx scripts/balancer.ts <port> <server port>,<server port>,...
//
// It does what the host's one does: spreads requests and live connections over the servers in
// turn, skips a server whose health check fails (checked every second, and at once when it
// refuses a connection), sets X-Forwarded-For to the caller's address, and cuts a connection
// that has been quiet for 60 seconds (BALANCER_IDLE_MS). GET /__balancer shows its counts.

import http from 'node:http';
import net from 'node:net';

const [portArg, ...serverArgs] = process.argv.slice(2);
const IDLE_MS = Number(process.env.BALANCER_IDLE_MS ?? 60_000);

type Backend = { port: number; up: boolean; open: number; upgrades: number; requests: number };
const backends: Backend[] = serverArgs
  .flatMap(arg => arg.split(','))
  .map(port => ({ port: Number(port), up: true, open: 0, upgrades: 0, requests: 0 }));
if (!Number(portArg) || !backends.length) {
  console.error('Usage: node --import tsx scripts/balancer.ts <port> <server port>,<server port>');
  process.exit(1);
}

let turn = 0;
const pick = (skip: Set<Backend>) => {
  for (let i = 0; i < backends.length; i++) {
    const backend = backends[(turn + i) % backends.length];
    if (backend.up && !skip.has(backend)) {
      turn = (turn + i + 1) % backends.length;
      return backend;
    }
  }
};

const check = (backend: Backend) => {
  const req = http.get({ host: '127.0.0.1', port: backend.port, path: '/v1/health', timeout: 1000, agent: false }, res => {
    backend.up = res.statusCode === 200;
    res.resume();
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', () => (backend.up = false));
};
setInterval(() => backends.forEach(check), 1000);
backends.forEach(check);

const callerOf = (req: http.IncomingMessage) => (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'x-forwarded-for']);
const agent = new http.Agent({ keepAlive: true, maxSockets: 1024 });
const badGateway = 'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';

const server = http.createServer((req, res) => {
  if (req.url === '/__balancer') {
    res.setHeader('Content-Type', 'application/json');
    return void res.end(JSON.stringify(backends));
  }
  // Bodies are small (the API refuses more than 64 KB): read it first, so a refused connection can go elsewhere.
  const chunks: Buffer[] = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const headers: http.OutgoingHttpHeaders = { 'x-forwarded-for': callerOf(req) };
    for (const [name, value] of Object.entries(req.headers)) if (!HOP_BY_HOP.has(name)) headers[name] = value;
    headers['content-length'] = body.length;
    const tried = new Set<Backend>();
    const send = () => {
      const backend = pick(tried);
      if (!backend) return void res.writeHead(502).end();
      tried.add(backend);
      backend.requests++;
      const upstream = http.request({ host: '127.0.0.1', port: backend.port, method: req.method, path: req.url, headers, agent }, answer => {
        const out = { ...answer.headers };
        delete out.connection;
        delete out['keep-alive'];
        res.writeHead(answer.statusCode ?? 502, out);
        answer.pipe(res);
      });
      upstream.on('error', (error: NodeJS.ErrnoException) => {
        if (res.headersSent) return void res.destroy();
        // The server never got it (refused), or a reading request on a dead pooled connection: try another.
        const retry = error.code === 'ECONNREFUSED' || (req.method === 'GET' && error.code === 'ECONNRESET');
        if (error.code === 'ECONNREFUSED') backend.up = false;
        if (retry) send();
        else res.writeHead(502).end();
      });
      upstream.end(body);
    };
    send();
  });
});

server.on('upgrade', (req, duplex, head) => {
  const client = duplex as net.Socket;
  client.on('error', () => client.destroy());
  const tried = new Set<Backend>();
  let upstream: net.Socket | undefined;
  client.on('close', () => upstream?.destroy());
  const connect = () => {
    const backend = pick(tried);
    if (!backend) return void client.end(badGateway);
    tried.add(backend);
    const socket = net.connect(backend.port, '127.0.0.1');
    upstream = socket;
    let connected = false;
    socket.once('connect', () => {
      connected = true;
      backend.open++;
      backend.upgrades++;
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2)
        if (req.rawHeaders[i].toLowerCase() !== 'x-forwarded-for') lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      lines.push(`X-Forwarded-For: ${callerOf(req)}`);
      socket.write(lines.join('\r\n') + '\r\n\r\n');
      if (head.length) socket.write(head);
      socket.pipe(client);
      client.pipe(socket);
    });
    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (connected || client.destroyed) return void client.destroy();
      if (error.code === 'ECONNREFUSED') backend.up = false;
      connect();
    });
    socket.on('close', () => {
      if (!connected) return;
      backend.open--;
      client.destroy();
    });
    socket.setTimeout(IDLE_MS, () => {
      socket.destroy();
      client.destroy();
    });
  };
  client.setTimeout(IDLE_MS, () => {
    client.destroy();
    upstream?.destroy();
  });
  connect();
});

server.listen(Number(portArg), '127.0.0.1', () => {
  console.log(`Balancer on ${portArg} → ${backends.map(b => b.port).join(', ')}`);
});
