import type { CommunityStatsPayload } from "./community-stats";
import type { LandingPayload } from "./landing-payload";

export type PublicHomeData = {
  landing: LandingPayload;
  community: CommunityStatsPayload;
};

export type PublicHomeSnapshot = {
  landing: LandingPayload | null;
  community: CommunityStatsPayload | null;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid public snapshot");
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid public snapshot");
  return value;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid public snapshot");
  return value;
}

function timestamp(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("Invalid public snapshot");
  return result;
}

// Project anonymous fields at both the server-cache and browser boundaries.
export function parsePublicHome(value: unknown): PublicHomeData {
  const root = record(value);
  const landing = record(root.landing);
  const stats = record(landing.stats);
  const cycle = landing.currentCycle === null ? null : record(landing.currentCycle);
  const community = record(root.community);
  const genders = record(community.genders);
  if (!Array.isArray(community.schools)) throw new Error("Invalid public snapshot");
  return {
    landing: {
      brand: text(landing.brand), tagline: text(landing.tagline),
      stats: {
        registeredUsers: count(stats.registeredUsers),
        completedQuestionnaires: count(stats.completedQuestionnaires),
        matchesDelivered: count(stats.matchesDelivered),
      },
      currentCycle: cycle ? {
        codename: text(cycle.codename), revealAt: timestamp(cycle.revealAt),
        participationDeadline: timestamp(cycle.participationDeadline),
      } : null,
    },
    community: {
      total: count(community.total),
      genders: {
        male: count(genders.male), female: count(genders.female),
        nonBinary: count(genders.nonBinary), unknown: count(genders.unknown),
      },
      schools: community.schools.map(value => {
        const school = record(value);
        return { id: school.id === null ? null : text(school.id), name: text(school.name), count: count(school.count) };
      }),
    },
  };
}
