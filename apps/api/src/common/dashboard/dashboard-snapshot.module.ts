import { Global, Module } from '@nestjs/common';
import { DashboardSnapshotService } from './dashboard-snapshot.service';

@Global()
@Module({
  providers: [DashboardSnapshotService],
  exports: [DashboardSnapshotService],
})
export class DashboardSnapshotModule {}
