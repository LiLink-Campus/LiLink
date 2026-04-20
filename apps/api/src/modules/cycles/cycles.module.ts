import { Module } from '@nestjs/common';
import { CyclesAutomationService } from './cycles-automation.service';
import { CyclesController } from './cycles.controller';
import { CyclesService } from './cycles.service';
import { MatchNarrativeService } from './match-narrative.service';

@Module({
  controllers: [CyclesController],
  providers: [CyclesAutomationService, CyclesService, MatchNarrativeService],
  exports: [CyclesService],
})
export class CyclesModule {}
