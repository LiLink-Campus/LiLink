import net, { type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { CheckoutRetryPool } from '../src/common/prisma/checkout-retry-pool';
import { createPrismaClient } from '../src/common/prisma/client';

it('recovers a failed connection without replaying a committed write whose response is lost', async () => {
  const target = new URL(process.env.DATABASE_URL!);
  if (
    target.hostname !== '127.0.0.1' ||
    target.port === '5432' ||
    !target.pathname.startsWith('/lilink_vip_test_')
  )
    throw new Error('Requires disposable local PostgreSQL.');
  const direct = new Pool({ connectionString: target.href });
  const table = `checkout_retry_${randomUUID().replaceAll('-', '')}`;
  const sockets = new Set<Socket>();
  let attempts = 0;
  let discardWriteResponse = false;
  const proxy = net.createServer((client) => {
    sockets.add(client);
    client.on('close', () => sockets.delete(client));
    if (++attempts === 1) {
      client.destroy();
      return;
    }
    const server = net.connect({
      host: target.hostname,
      port: Number(target.port),
    });
    sockets.add(server);
    server.on('close', () => sockets.delete(server));
    client.on('error', () => server.destroy());
    server.on('error', () => client.destroy());
    client.on('close', () => server.destroy());
    server.on('close', () => client.destroy());
    client.on('data', (bytes) => {
      if (bytes.toString().includes(`UPDATE "${table}"`))
        discardWriteResponse = true;
      server.write(bytes);
    });
    server.on('data', (bytes) => {
      if (discardWriteResponse) {
        discardWriteResponse = false;
        client.destroy();
        server.destroy();
      } else client.write(bytes);
    });
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const port = (proxy.address() as net.AddressInfo).port;
  const proxied = new URL(target.href);
  proxied.port = String(port);
  const pool = new CheckoutRetryPool({
    connectionString: proxied.href,
    connectionTimeoutMillis: 2000,
    max: 1,
  });
  try {
    await direct.query(`CREATE TABLE "${table}" (value integer NOT NULL)`);
    await direct.query(`INSERT INTO "${table}" VALUES (0)`);
    expect(
      (await pool.query<{ value: number }>('SELECT 1 AS value')).rows[0].value,
    ).toBe(1);
    expect(attempts).toBe(2);
    await expect(
      pool.query(`UPDATE "${table}" SET value=value+1 RETURNING value`),
    ).rejects.toThrow();
    expect(
      (await direct.query<{ value: number }>(`SELECT value FROM "${table}"`))
        .rows[0].value,
    ).toBe(1);
    expect(attempts).toBe(2);
    expect(
      (await pool.query<{ value: number }>(`SELECT value FROM "${table}"`))
        .rows[0].value,
    ).toBe(1);
    expect(attempts).toBe(3);
    const prisma = createPrismaClient();
    try {
      await expect(prisma.$queryRaw`SELECT 1 AS value`).resolves.toEqual([
        { value: 1 },
      ]);
      await prisma.$disconnect();
      await expect(prisma.$queryRaw`SELECT 2 AS value`).resolves.toEqual([
        { value: 2 },
      ]);
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    await pool.end();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await direct.query(`DROP TABLE IF EXISTS "${table}"`);
    await direct.end();
  }
});
