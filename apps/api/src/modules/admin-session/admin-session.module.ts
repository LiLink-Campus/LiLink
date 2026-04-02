import { Module } from '@nestjs/common';
import { AdminSessionController } from './admin-session.controller';
import { AdminSessionService } from './admin-session.service';

@Module({
  controllers: [AdminSessionController],
  providers: [AdminSessionService],
})
export class AdminSessionModule {}
