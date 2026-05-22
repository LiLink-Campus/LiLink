import { Module } from '@nestjs/common';
import { ActivationService } from './activation.service';

@Module({
  providers: [ActivationService],
  exports: [ActivationService],
})
export class ActivationModule {}
