import type {
  MatchCycleStatus,
  ParticipationStatus,
  WeeklyIntent,
} from '../../common/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';

export type DashboardCycleRow = {
  kind: 'CURRENT' | 'RECENT' | 'LAST_PARTICIPATION';
  id: string;
  codename: string;
  revealAt: Date;
  participationDeadline: Date;
  status: MatchCycleStatus;
  participationStatus: ParticipationStatus | null;
  intent: WeeklyIntent | null;
};

export function readDashboardCycles(
  db: PrismaService,
  userId: string,
  historyLimit: number,
) {
  // Read cycle selection and the user's participation in one database snapshot.
  return db.$queryRaw<DashboardCycleRow[]>`
    WITH current_cycle AS (
      SELECT id, codename, "revealAt", "participationDeadline", status
      FROM "MatchCycle"
      WHERE status IN ('OPEN', 'PREPARING', 'REVEAL_READY')
      ORDER BY "revealAt" ASC LIMIT 1
    ), recent_cycles AS (
      SELECT id, codename, "revealAt", "participationDeadline", status
      FROM "MatchCycle" WHERE status = 'REVEALED'
      ORDER BY "revealAt" DESC LIMIT ${historyLimit}
    ), last_participation AS (
      SELECT c.id, c.codename, c."revealAt", c."participationDeadline", c.status,
             p.status AS "participationStatus", p.intent
      FROM "MatchCycle" c JOIN "CycleParticipation" p ON p."cycleId" = c.id
      WHERE c.status = 'REVEALED' AND p."userId" = ${userId}
      ORDER BY c."revealAt" DESC LIMIT 1
    )
    SELECT 'CURRENT'::text AS kind, c.*,
           p.status AS "participationStatus", p.intent
    FROM current_cycle c
    LEFT JOIN "CycleParticipation" p ON p."cycleId" = c.id AND p."userId" = ${userId}
    UNION ALL
    SELECT 'RECENT'::text AS kind, c.*,
           NULL::"ParticipationStatus" AS "participationStatus", NULL::"WeeklyIntent" AS intent
    FROM recent_cycles c
    UNION ALL
    SELECT 'LAST_PARTICIPATION'::text AS kind, p.* FROM last_participation p
    ORDER BY kind, "revealAt" DESC
  `;
}
