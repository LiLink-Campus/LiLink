import { Module } from '@nestjs/common';
import { PublicModule } from '../public/public.module';
import { EducationController } from './education.controller';
import { EducationService } from './education.service';

@Module({
  imports: [PublicModule],
  controllers: [EducationController],
  providers: [EducationService],
})
export class EducationModule {}
