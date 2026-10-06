import { createMailDatabase } from '../src/common/mail/mail-database';
import { connect, createServer, type Socket, type Server } from 'node:net';

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
}
async function stop(server: Server, sockets: Set<Socket>) {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

export async function smtpBlackhole() {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const port = await listen(server);
  return { port, sockets, stop: () => stop(server, sockets) };
}

// Relay to real Mailpit, holding only its final DATA acknowledgement. Delivery
// has occurred, but the worker cannot yet run its completion write.
export async function smtpAckProxy(upstreamPort: number) {
  const sockets = new Set<Socket>();
  let release!: () => void;
  let acknowledged!: () => void;
  const ready = new Promise<void>((resolve) => {
    acknowledged = resolve;
  });
  const server = createServer((client) => {
    const upstream = connect(upstreamPort, '127.0.0.1');
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {
        client.destroy();
        upstream.destroy();
      });
    }
    let dataFinished = false;
    client.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('\r\n.\r\n')) dataFinished = true;
      upstream.write(chunk);
    });
    upstream.on('data', (chunk: Buffer) => {
      if (dataFinished && chunk.toString().startsWith('250')) {
        release = () => client.write(chunk);
        acknowledged();
        dataFinished = false;
      } else client.write(chunk);
    });
    client.on('close', () => upstream.destroy());
  });
  const port = await listen(server);
  return {
    port,
    ready,
    release: () => release(),
    stop: () => stop(server, sockets),
  };
}

// Owns only loopback proxy sockets. PostgreSQL and its real protocol remain
// unchanged; dropping traffic reproduces an unresponsive database connection.
export async function databaseFaultProxy(upstreamPort: number) {
  let paused = false;
  let closedConnections = 0;
  const sockets = new Set<Socket>();
  const server = createServer((client) => {
    const upstream = connect(upstreamPort, '127.0.0.1');
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {
        client.destroy();
        upstream.destroy();
      });
    }
    client.on('data', (chunk: Buffer) => {
      if (!paused) upstream.write(chunk);
    });
    upstream.on('data', (chunk: Buffer) => {
      if (!paused) client.write(chunk);
    });
    client.on('close', () => {
      closedConnections++;
      upstream.destroy();
    });
    upstream.on('close', () => client.destroy());
  });
  const port = await listen(server);
  return {
    port,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    closedConnections: () => closedConnections,
    stop: () => stop(server, sockets),
  };
}

export function proxiedMailDatabase(port: number) {
  const proxied = new URL(process.env.DATABASE_URL!);
  proxied.port = String(port);
  const originalDatabaseUrl = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = proxied.toString();
    return createMailDatabase();
  } finally {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
}
