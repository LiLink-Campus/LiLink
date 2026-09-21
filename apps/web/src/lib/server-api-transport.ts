import "server-only";

import { isIP } from "node:net";
import { Pool } from "undici";

let connection: { origin: string; address: string; pool: Pool } | undefined;

export function fetchServerApi(url: string, options: RequestInit) {
  const address = process.env.SERVER_API_CONNECT_ADDRESS?.trim();
  if (!address) return fetch(url, options);

  const target = new URL(url);
  const configured = new URL(process.env.NEXT_PUBLIC_API_BASE_URL!);
  const family = isIP(address);
  if (!family || target.protocol !== "https:" || target.origin !== configured.origin) {
    throw new Error("Invalid server API connection configuration.");
  }

  if (!connection || connection.origin !== target.origin || connection.address !== address) {
    if (connection) void connection.pool.close();
    connection = {
      origin: target.origin,
      address,
      pool: new Pool(target.origin, {
        connections: 16,
        connect: {
          // Change DNS routing only; retain the URL hostname for Host, SNI and certificate verification.
          lookup(hostname, lookupOptions, callback) {
            if (hostname !== configured.hostname) {
              callback(new Error("Unexpected API connection hostname."), "", 4);
            } else if (lookupOptions.all) {
              callback(null, [{ address, family }]);
            } else {
              callback(null, address, family);
            }
          },
        },
      }),
    };
  }

  const init: RequestInit & { dispatcher: Pool } = {
    ...options,
    redirect: "error",
    dispatcher: connection.pool,
  };
  return fetch(url, init);
}
