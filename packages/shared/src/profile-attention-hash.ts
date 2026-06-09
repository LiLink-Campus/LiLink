const PROFILE_ATTENTION_HASH_PREFIX = "#profile-attention-";

function decodeAttentionHashSegment(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function profileAttentionElementId(key: string) {
  return `profile-attention-${key}`;
}

export function profileAttentionHashForKey(key: string) {
  return `${PROFILE_ATTENTION_HASH_PREFIX}${encodeURIComponent(key)}`;
}

/**
 * Resolves a dashboard profile attention target key from the URL hash.
 */
export function profileAttentionKeyFromHash(hash: string) {
  if (hash.startsWith(PROFILE_ATTENTION_HASH_PREFIX)) {
    return decodeAttentionHashSegment(
      hash.slice(PROFILE_ATTENTION_HASH_PREFIX.length),
    );
  }

  return null;
}
