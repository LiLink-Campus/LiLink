import type { PublicHomeDisplayData } from "@lilink/shared";

export type LandingDisplayPayload = PublicHomeDisplayData["landing"];

export type LandingPayload = {
  brand: string;
  tagline: string;
  stats: {
    registeredUsers: number;
    completedQuestionnaires: number;
    matchesDelivered: number;
  };
  currentCycle: {
    codename: string;
    revealAt: string;
    participationDeadline: string;
  } | null;
};
