import { env } from '../../config/env';

export type PublicationProbe =
  | { kind: 'published'; hash: string }
  | { kind: 'unsupported' };

// The target is derived from the already validated callback, never user input.
export async function readHomePublication(): Promise<PublicationProbe> {
  const target = new URL(env.PUBLIC_CACHE_REVALIDATION_URL);
  target.pathname = '/';
  const response = await fetch(target, {
    redirect: 'error',
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(5_000),
  });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('text/html')
  ) {
    await response.body?.cancel();
    throw new Error('Publication unavailable.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Publication unavailable.');
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262_144) throw new Error('Publication exceeds limit.');
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const html = Buffer.concat(parts).toString('utf8');
  // Require the complete successful page, not an error page or streamed prefix.
  if (!html.includes('</html>')) {
    throw new Error('Publication incomplete.');
  }
  const markers = [
    ...html.matchAll(
      /<div\b[^>]*\bdata-lilink-home-fingerprint="v1:([a-f0-9]{64})"[^>]*>/g,
    ),
  ];
  if (markers.length === 0) return { kind: 'unsupported' };
  if (markers.length !== 1) throw new Error('Publication ambiguous.');
  return { kind: 'published', hash: markers[0][1] };
}

// A successful notification must be the receiver's bounded protocol response.
// It remains an acknowledgment, not proof of the subsequently published HTML.
export async function readInvalidationAcknowledgment(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel();
    throw new Error('Invalid revalidation acknowledgment.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing revalidation acknowledgment.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024)
        throw new Error('Revalidation acknowledgment exceeds limit.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    (payload as Record<string, unknown>).ok !== true ||
    typeof (payload as Record<string, unknown>).invalidated !== 'boolean' ||
    Object.keys(payload).length !== 2
  ) {
    throw new Error('Invalid revalidation acknowledgment.');
  }
}
