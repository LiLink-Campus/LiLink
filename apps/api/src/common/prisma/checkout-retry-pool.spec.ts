import { Pool, type PoolClient } from 'pg';
import { CheckoutRetryPool } from './checkout-retry-pool';

afterEach(() => jest.restoreAllMocks());

it('retries a failed checkout once and returns the acquired client', async () => {
  const client = { release: jest.fn() } as unknown as PoolClient;
  const connect = jest
    .spyOn(Pool.prototype, 'connect')
    .mockImplementationOnce(
      () =>
        Promise.reject(
          new Error('Connection terminated unexpectedly'),
        ) as never,
    )
    .mockImplementationOnce(() => Promise.resolve(client) as never);
  const pool = new CheckoutRetryPool();
  await expect(pool.connect()).resolves.toBe(client);
  expect(connect).toHaveBeenCalledTimes(2);
  await pool.end();
});

it('supports callback checkout and stops after a second connection failure', async () => {
  const error = Object.assign(new Error('socket reset'), {
    code: 'ECONNRESET',
  });
  const connect = jest
    .spyOn(Pool.prototype, 'connect')
    .mockImplementation(() => Promise.reject(error) as never);
  const pool = new CheckoutRetryPool();
  const received = await new Promise((resolve) =>
    pool.connect((err, client) => resolve({ err, client })),
  );
  expect(received).toEqual({ err: error, client: undefined });
  expect(connect).toHaveBeenCalledTimes(2);
  await pool.end();
});

it.each([
  Object.assign(new Error('password authentication failed'), { code: '28P01' }),
  new Error('timeout exceeded when trying to connect'),
  new Error('Cannot use a pool after calling end on the pool'),
])(
  'does not retry configuration, pool timeout or lifecycle errors',
  async (error) => {
    const connect = jest
      .spyOn(Pool.prototype, 'connect')
      .mockImplementation(() => Promise.reject(error) as never);
    const pool = new CheckoutRetryPool();
    await expect(pool.connect()).rejects.toBe(error);
    expect(connect).toHaveBeenCalledTimes(1);
    await pool.end();
  },
);
