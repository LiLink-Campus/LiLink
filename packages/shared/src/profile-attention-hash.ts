const PROFILE_ATTENTION_HASH_PREFIX = "#profile-attention-";
const LEGACY_QUESTIONNAIRE_HASH_PREFIX = "#questionnaire-question-";

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
 * Supports the current prefix and legacy questionnaire deep-link hashes.
 */
export function profileAttentionKeyFromHash(hash: string) {
  if (hash.startsWith(PROFILE_ATTENTION_HASH_PREFIX)) {
    return decodeAttentionHashSegment(
      hash.slice(PROFILE_ATTENTION_HASH_PREFIX.length),
    );
  }

  if (hash.startsWith(LEGACY_QUESTIONNAIRE_HASH_PREFIX)) {
    return decodeAttentionHashSegment(
      hash.slice(LEGACY_QUESTIONNAIRE_HASH_PREFIX.length),
    );
  }

  return null;
}
