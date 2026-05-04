import { Module } from '@nestjs/common';
import { DashboardSnapshotModule } from '../../common/dashboard/dashboard-snapshot.module';
import { CyclesAutomationService } from './cycles-automation.service';
import { CyclesController } from './cycles.controller';
import { CyclesService } from './cycles.service';
import { MatchNarrativeService } from './match-narrative.service';

@Module({
  imports: [DashboardSnapshotModule],
  controllers: [CyclesController],
  providers: [CyclesAutomationService, CyclesService, MatchNarrativeService],
  exports: [CyclesService],
})
export class CyclesModule {}
