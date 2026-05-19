/**
 * Local ops: POST /admin/cycles/run with force=true for the current runnable cycle.
 * Same auth semantics as scripts/admin-token-for-local-script.mjs.
 */
import { loadMonorepoEnv } from "./load-env.mjs";
import {
  resolveAdminSessionForLocalScripts,
} from "./admin-token-for-local-script.mjs";

loadMonorepoEnv();

function pickRunnableCycle(items) {
  const order = ["REVEAL_READY", "PREPARING", "OPEN"];
  for (const status of order) {
    const match = items.find((c) => c.status === status);
    if (match) {
      return match;
    }
  }

  return null;
}

async function main() {
  /** @type {{ token: string; cookieName: string; baseUrl: string }} */
  let session;
  try {
    session = await resolveAdminSessionForLocalScripts();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const { token, cookieName, baseUrl } = session;

  const cyclesRes = await fetch(`${baseUrl}/admin/cycles?page=1&pageSize=50`, {
    headers: {
      Cookie: `${cookieName}=${token}`,
      Accept: "application/json",
    },
  });

  if (!cyclesRes.ok) {
    console.error("Could not load cycles.");
    process.exitCode = 1;
    return;
  }

  const cyclesBody = await cyclesRes.json();
  const items = Array.isArray(cyclesBody.items) ? cyclesBody.items : [];
  const cycle = pickRunnableCycle(items);

  if (!cycle) {
    console.error(
      "No OPEN / PREPARING / REVEAL_READY cycle found in the latest 50 rounds.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Force-running cycle ${cycle.codename ?? cycle.id} (${cycle.id})`);

  const runRes = await fetch(`${baseUrl}/admin/cycles/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${cookieName}=${token}`,
      Accept: "application/json",
    },
    body: JSON.stringify({ cycleId: cycle.id, force: true }),
  });

  const bodyText = await runRes.text();
  /** @type {{ message?: string; state?: string; createdMatches?: number } | null} */
  let parsed = null;

  try {
    parsed = JSON.parse(bodyText);
  } catch {
    // raw only
  }

  if (!runRes.ok) {
    console.error(
      parsed?.message || bodyText || `Run failed (${runRes.status})`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: parsed?.ok ?? true,
        cycleId: cycle.id,
        state: parsed?.state,
        message: parsed?.message,
        createdMatches: parsed?.createdMatches,
      },
      null,
      2,
    ),
  );
}

await main();
