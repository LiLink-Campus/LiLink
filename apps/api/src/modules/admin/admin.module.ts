import { Module } from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';
import { AdminSchoolService } from './admin-school.service';
import { CyclesModule } from '../cycles/cycles.module';
import { PublicModule } from '../public/public.module';
import { QuestionnaireModule } from '../questionnaire/questionnaire.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  // PublicModule is imported so AdminSchoolService can invalidate the public
  // eligible-schools cache when a school's registrationEligible flag changes.
  // QuestionnaireModule is imported so AdminService can invalidate the public
  // current-questionnaire cache when an admin publishes a questionnaire revision.
  imports: [CyclesModule, PublicModule, QuestionnaireModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuditService, AdminSchoolService],
})
export class AdminModule {}
