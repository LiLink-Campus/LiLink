/**
 * Creates a new MatchCycle via PUT /admin/cycles (same as admin UI "新建轮次").
 *
 * Dates must be ISO-8601. Env overrides optional:
 *   NEW_CYCLE_CODENAME, NEW_CYCLE_PARTICIPATION_DEADLINE, NEW_CYCLE_REVEAL_AT,
 *   NEW_CYCLE_STATUS (DRAFT|OPEN, default OPEN), NEW_CYCLE_NOTES
 */
import { loadMonorepoEnv } from "./load-env.mjs";
import { resolveAdminSessionForLocalScripts } from "./admin-token-for-local-script.mjs";

loadMonorepoEnv();

/** @returns {`${string}-${string}-${string}-${string}-${string}`} */
function nextUniqueCodename(takenCodenamesSet) {
  const base =
    process.env.NEW_CYCLE_CODENAME?.trim() ||
    `launch-${new Date().toISOString().slice(0, 10)}`;
  let candidate = base;
  let suffix = 2;
  while (takenCodenamesSet.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  takenCodenamesSet.add(candidate);
  return candidate;
}

function defaultDeadlineAndReveal() {
  const deadline = new Date();
  deadline.setUTCDate(deadline.getUTCDate() + 5);
  deadline.setUTCHours(23, 59, 59, 0);

  const reveal = new Date();
  reveal.setUTCDate(reveal.getUTCDate() + 7);
  reveal.setUTCHours(13, 0, 0, 0);

  return { deadlineIso: deadline.toISOString(), revealIso: reveal.toISOString() };
}

async function main() {
  const { deadlineIso: defaultDl, revealIso: defaultRv } = defaultDeadlineAndReveal();
  const participationDeadline =
    process.env.NEW_CYCLE_PARTICIPATION_DEADLINE || defaultDl;
  const revealAt = process.env.NEW_CYCLE_REVEAL_AT || defaultRv;
  const statusRaw =
    process.env.NEW_CYCLE_STATUS?.trim().toUpperCase() || "OPEN";
  const notes = process.env.NEW_CYCLE_NOTES?.trim();

  const status = statusRaw === "DRAFT" ? "DRAFT" : "OPEN";

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

  const listing = await fetch(`${baseUrl}/admin/cycles?page=1&pageSize=500`, {
    headers: {
      Cookie: `${cookieName}=${token}`,
      Accept: "application/json",
    },
  });

  if (!listing.ok) {
    console.error("Could not load existing cycles.");
    process.exitCode = 1;
    return;
  }

  const listingJson = await listing.json();
  const items = Array.isArray(listingJson.items) ? listingJson.items : [];
  const codenamesTaken = new Set(items.map((c) => c.codename));

  const codename = nextUniqueCodename(codenamesTaken);

  const body = {
    codename,
    participationDeadline,
    revealAt,
    status,
    ...(notes ? { notes } : {}),
  };

  const saved = await fetch(`${baseUrl}/admin/cycles`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${cookieName}=${token}`,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await saved.text();
  /** @type {Record<string, unknown> | null} */
  let parsed = null;

  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw
  }

  if (!saved.ok) {
    console.error(
      (parsed && typeof parsed.message === "string" && parsed.message) ||
        text ||
        `Create failed (${saved.status})`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        id: parsed?.id,
        codename,
        participationDeadline,
        revealAt,
        status,
        notes: notes ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
