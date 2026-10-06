import { Module } from '@nestjs/common';
import { DashboardSnapshotModule } from '../../common/dashboard/dashboard-snapshot.module';
import { PublicModule } from '../public/public.module';
import { CyclesAutomationService } from './cycles-automation.service';
import { CyclesController } from './cycles.controller';
import { CyclesService } from './cycles.service';
import { WeeklyCycleService } from './weekly-cycle.service';
import { CycleMatchingInputService } from './cycle-matching-input.service';
import { CycleMatchingHistoryService } from './cycle-matching-history.service';
import { CycleMatchingService } from './cycle-matching.service';
import { CyclePreparationStateService } from './cycle-preparation-state.service';
import { CyclePreparationService } from './cycle-preparation.service';
import { CycleRevealService } from './cycle-reveal.service';

@Module({
  imports: [DashboardSnapshotModule, PublicModule],
  controllers: [CyclesController],
  providers: [
    CyclesAutomationService,
    CyclesService,
    WeeklyCycleService,
    CycleMatchingInputService,
    CycleMatchingHistoryService,
    CycleMatchingService,
    CyclePreparationStateService,
    CyclePreparationService,
    CycleRevealService,
  ],
  exports: [CyclesService, WeeklyCycleService, CycleMatchingService],
})
export class CyclesModule {}
