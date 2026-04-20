import { Module } from '@nestjs/common';
import { CyclesController } from './cycles.controller';
import { CyclesService } from './cycles.service';
import { MatchNarrativeService } from './match-narrative.service';

@Module({
  controllers: [CyclesController],
  providers: [CyclesService, MatchNarrativeService],
  exports: [CyclesService],
})
export class CyclesModule {}
