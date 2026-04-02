import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { QuestionnaireModule } from '../questionnaire/questionnaire.module';

@Module({
  imports: [QuestionnaireModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
