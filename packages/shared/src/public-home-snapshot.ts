export type PublicHomeDisplayData = {
  landing: {
    stats: {
      registeredUsers: number;
      completedQuestionnaires: number;
      matchesDelivered: number;
    };
    currentCycle: { revealAt: string } | null;
  };
  community: {
    total: number;
    genders: { male: number; female: number; nonBinary: number; unknown: number };
    schools: { id: string | null; name: string; count: number }[];
  };
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid public home snapshot");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid public home snapshot");
  return value;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid public home snapshot");
  }
  return value;
}

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(text(value));
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid public home snapshot");
  return date.toISOString();
}

// This is the rendered homepage contract, shared by delivery hashes and Web.
// External public API payloads retain their additional metadata independently.
export function normalizePublicHomeSnapshot(value: unknown): PublicHomeDisplayData {
  const root = record(value);
  const landing = record(root.landing);
  const stats = record(landing.stats);
  const cycle = landing.currentCycle === null ? null : record(landing.currentCycle);
  const community = record(root.community);
  const genders = record(community.genders);
  if (!Array.isArray(community.schools)) throw new Error("Invalid public home snapshot");
  return {
    landing: {
      stats: {
        registeredUsers: count(stats.registeredUsers),
        completedQuestionnaires: count(stats.completedQuestionnaires),
        matchesDelivered: count(stats.matchesDelivered),
      },
      currentCycle: cycle ? { revealAt: timestamp(cycle.revealAt) } : null,
    },
    community: {
      total: count(community.total),
      genders: {
        male: count(genders.male), female: count(genders.female),
        nonBinary: count(genders.nonBinary), unknown: count(genders.unknown),
      },
      schools: community.schools.map(value => {
        const school = record(value);
        return {
          id: school.id === null ? null : text(school.id),
          name: text(school.name), count: count(school.count),
        };
      }),
    },
  };
}
