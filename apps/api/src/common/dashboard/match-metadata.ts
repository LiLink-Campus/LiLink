import { Prisma } from '../prisma/client';

export function normalizeMatchReasons(rawReasons: Prisma.JsonValue): string[] {
  if (!Array.isArray(rawReasons)) {
    return [];
  }

  return rawReasons.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  );
}

export function normalizeMatchReason(
  rawReason: string | null | undefined,
  normalizedReasons: string[],
) {
  const trimmedReason = rawReason?.trim();
  if (trimmedReason) {
    return trimmedReason;
  }

  if (normalizedReasons.length === 0) {
    return null;
  }

  return normalizedReasons.join(' ');
}

export function normalizeConversationTopics(
  rawTopics: Prisma.JsonValue | null | undefined,
) {
  if (!Array.isArray(rawTopics)) {
    return [];
  }

  return rawTopics.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  );
}
