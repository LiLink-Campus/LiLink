import { Module } from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';
import { AdminSchoolService } from './admin-school.service';
import { CyclesModule } from '../cycles/cycles.module';
import { PublicModule } from '../public/public.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  // PublicModule is imported so AdminSchoolService can invalidate the public
  // eligible-schools cache when a school's registrationEligible flag changes.
  imports: [CyclesModule, PublicModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuditService, AdminSchoolService],
})
export class AdminModule {}
