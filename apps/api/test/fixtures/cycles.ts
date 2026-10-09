import { PrismaService } from '../../src/common/prisma/prisma.service';
import { DashboardSnapshotService } from '../../src/common/dashboard/dashboard-snapshot.service';
import { MailService } from '../../src/common/mail/mail.service';
import { PublicService } from '../../src/modules/public/public.service';
import { CyclesService } from '../../src/modules/cycles/cycles.service';
import { CycleMatchingInputService } from '../../src/modules/cycles/cycle-matching-input.service';
import { CycleMatchingHistoryService } from '../../src/modules/cycles/cycle-matching-history.service';
import { CycleMatchingService } from '../../src/modules/cycles/cycle-matching.service';
import { CyclePreparationStateService } from '../../src/modules/cycles/cycle-preparation-state.service';
import { CyclePreparationService } from '../../src/modules/cycles/cycle-preparation.service';
import { CycleRevealService } from '../../src/modules/cycles/cycle-reveal.service';

export function createCycleServices(
  prisma: PrismaService,
  snapshots: DashboardSnapshotService,
  mail: MailService,
  publicService = new PublicService(prisma),
) {
  const input = new CycleMatchingInputService(prisma);
  const history = new CycleMatchingHistoryService(prisma);
  const matching = new CycleMatchingService(prisma, input, history);
  const state = new CyclePreparationStateService(prisma);
  const preparation = new CyclePreparationService(
    prisma,
    input,
    matching,
    state,
  );
  const reveal = new CycleRevealService(prisma, snapshots, mail, publicService);
  const cycles = new CyclesService(
    prisma,
    input,
    preparation,
    reveal,
    publicService,
  );
  return { cycles, input, matching, preparation, reveal };
}
