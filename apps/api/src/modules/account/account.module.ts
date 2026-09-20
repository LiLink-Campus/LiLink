import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AccountDeletionService } from './account-deletion.service';
import { PublicModule } from '../public/public.module';
import { MatchEstimateService } from './match-estimate.service';
import { QuestionnaireModule } from '../questionnaire/questionnaire.module';
import { ActivationModule } from '../activation/activation.module';

@Module({
  imports: [QuestionnaireModule, ActivationModule, PublicModule],
  controllers: [AccountController],
  providers: [AccountService, MatchEstimateService, AccountDeletionService],
})
export class AccountModule {}
