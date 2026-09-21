export type CommunityStatsPayload = {
  total: number;
  genders: { male: number; female: number; nonBinary: number; unknown: number };
  schools: { id: string | null; name: string; count: number }[];
  generatedAt: string;
};
