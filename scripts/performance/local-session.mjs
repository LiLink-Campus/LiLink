import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function futureExpiry(raw) {
  const expires = Date.parse(raw);
  if (!Number.isFinite(expires) || expires <= Date.now() || expires - Date.now() > 90 * 60_000) {
    throw new Error('Disposable session must have a valid future expiry within 90 minutes.');
  }
  return expires;
}
function loopback(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
    || url.username || url.password || url.search || url.hash) {
    throw new Error('Disposable endpoints must be credential-free loopback HTTP URLs.');
  }
}
export async function readDisposableSession(input) {
  const session = JSON.parse(await readFile(input, 'utf8'));
  if (!/^[a-f0-9]{12}$/.test(session.runId ?? '')
    || await realpath(input) !== path.join(repositoryRoot, 'artifacts/e2e', session.runId, 'session.json')) {
    throw new Error('Use the canonical session.json created by the isolated E2E runner.');
  }
  futureExpiry(session.expiresAt);
  for (const value of [session.webUrl, session.apiUrl]) loopback(value);
  for (const value of [session.cdnUrl, session.mailUrl].filter(Boolean)) loopback(value);
  return session;
}
export async function readComparisonSession(input) {
  const comparison = JSON.parse(await readFile(input, 'utf8'));
  const session = await readDisposableSession(comparison.sourceSession);
  if (await realpath(input) !== path.join(repositoryRoot, 'artifacts/performance', `baseline-${session.runId}`, 'comparison-session.json')
    || comparison.afterUrl !== session.webUrl || comparison.apiUrl !== session.apiUrl
    || comparison.cdnUrl !== session.cdnUrl || comparison.expiresAt !== session.expiresAt) {
    throw new Error('Baseline metadata must belong to the same canonical disposable session.');
  }
  futureExpiry(comparison.expiresAt); loopback(comparison.beforeUrl);
  return { comparison, session };
}
