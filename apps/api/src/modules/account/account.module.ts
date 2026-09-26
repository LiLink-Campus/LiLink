import { Module } from '@nestjs/common';
import { ActivationModule } from '../activation/activation.module';
import { PublicModule } from '../public/public.module';
import { QuestionnaireModule } from '../questionnaire/questionnaire.module';
import { VipModule } from '../vip/vip.module';
import { AccountDashboardService } from './account-dashboard.service';
import { AccountDeletionService } from './account-deletion.service';
import { AccountParticipationService } from './account-participation.service';
import { AccountProfileService } from './account-profile.service';
import { AccountQuestionnaireService } from './account-questionnaire.service';
import { AccountController } from './account.controller';
import { ContactPreferencesService } from './contact-preferences.service';
import { MatchEstimateService } from './match-estimate.service';
import { MatchReportService } from './match-report.service';
import { PageBootstrapController } from './page-bootstrap.controller';

@Module({
  imports: [QuestionnaireModule, ActivationModule, PublicModule, VipModule],
  controllers: [AccountController, PageBootstrapController],
  providers: [
    AccountProfileService,
    AccountDashboardService,
    ContactPreferencesService,
    AccountQuestionnaireService,
    AccountParticipationService,
    MatchReportService,
    MatchEstimateService,
    AccountDeletionService,
  ],
})
export class AccountModule {}
