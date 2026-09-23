import { Module } from '@nestjs/common';
import { DashboardSnapshotModule } from '../../common/dashboard/dashboard-snapshot.module';
import { CyclesAutomationService } from './cycles-automation.service';
import { CyclesController } from './cycles.controller';
import { CyclesService } from './cycles.service';
import { WeeklyCycleService } from './weekly-cycle.service';

@Module({
  imports: [DashboardSnapshotModule],
  controllers: [CyclesController],
  providers: [CyclesAutomationService, CyclesService, WeeklyCycleService],
  exports: [CyclesService, WeeklyCycleService],
})
export class CyclesModule {}
