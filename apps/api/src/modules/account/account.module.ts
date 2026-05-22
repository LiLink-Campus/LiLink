import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { MatchEstimateService } from './match-estimate.service';
import { QuestionnaireModule } from '../questionnaire/questionnaire.module';
import { ActivationModule } from '../activation/activation.module';

@Module({
  imports: [QuestionnaireModule, ActivationModule],
  controllers: [AccountController],
  providers: [AccountService, MatchEstimateService],
})
export class AccountModule {}
