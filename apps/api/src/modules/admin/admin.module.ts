import { Module } from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';
import { AdminSchoolService } from './admin-school.service';
import { CyclesModule } from '../cycles/cycles.module';
import { PublicModule } from '../public/public.module';
import { QuestionnaireModule } from '../questionnaire/questionnaire.module';
import { AdminController } from './admin.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminUserReadService } from './admin-user-read.service';
import { AdminUserWriteService } from './admin-user-write.service';
import { AdminCycleReadService } from './admin-cycle-read.service';
import { AdminCycleManagementService } from './admin-cycle-management.service';
import { AdminQuestionnaireService } from './admin-questionnaire.service';
import { AdminReportReadService } from './admin-report-read.service';
import { AdminReportReviewService } from './admin-report-review.service';
import { AdminTestDataService } from './admin-test-data.service';
import { AdminQuestionnaireRevisionService } from './admin-questionnaire-revision.service';

@Module({
  // PublicModule is imported so AdminSchoolService can invalidate the public
  // eligible-schools cache when a school's registrationEligible flag changes.
  // QuestionnaireModule is imported so AdminQuestionnaireService can invalidate the public
  // current-questionnaire cache when an admin publishes a questionnaire revision.
  imports: [CyclesModule, PublicModule, QuestionnaireModule],
  controllers: [AdminController],
  providers: [
    AdminDashboardService,
    AdminUserReadService,
    AdminUserWriteService,
    AdminCycleReadService,
    AdminCycleManagementService,
    AdminQuestionnaireService,
    AdminReportReadService,
    AdminReportReviewService,
    AdminTestDataService,
    AdminQuestionnaireRevisionService,
    AdminAuditService,
    AdminSchoolService,
  ],
})
export class AdminModule {}
