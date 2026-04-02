import { Module } from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';
import { AdminSchoolService } from './admin-school.service';
import { CyclesModule } from '../cycles/cycles.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [CyclesModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuditService, AdminSchoolService],
})
export class AdminModule {}
