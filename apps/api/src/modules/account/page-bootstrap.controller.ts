import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import {
  LOCALE_COOKIE_NAME,
  parseSupportedLocale,
  computeQuestionnaireProgress,
} from '@lilink/shared';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { VipService } from '../vip/vip.service';
import { AccountDashboardService } from './account-dashboard.service';
import { AccountQuestionnaireService } from './account-questionnaire.service';
import { ContactPreferencesService } from './contact-preferences.service';

@Controller('me/page-bootstrap')
@UseGuards(JwtAuthGuard)
export class PageBootstrapController {
  constructor(
    private readonly accountDashboardService: AccountDashboardService,
    private readonly contactPreferencesService: ContactPreferencesService,
    private readonly accountQuestionnaireService: AccountQuestionnaireService,
    private readonly questionnaireService: QuestionnaireService,
    private readonly vipService: VipService,
  ) {}

  private user(request: AuthenticatedRequest) {
    const identity = request.user!;
    const user = {
      id: identity.sub,
      email: identity.email,
      displayName: identity.displayName,
      preferredLocale: identity.preferredLocale,
    };
    const cookies = request.cookies as Record<string, unknown> | undefined;
    return {
      ...user,
      preferredLocale:
        parseSupportedLocale(cookies?.[LOCALE_COOKIE_NAME]) ??
        user.preferredLocale,
    };
  }

  private async questionnaireData(userId: string) {
    const [questionnaire, savedQuestionnaire, contactPreferences] =
      await Promise.all([
        this.questionnaireService.getCurrentVersion(),
        this.accountQuestionnaireService.getQuestionnaire(userId),
        this.contactPreferencesService.getContactPreferences(userId),
      ]);
    return { questionnaire, savedQuestionnaire, contactPreferences };
  }

  @Get('home')
  @Header('Cache-Control', 'private, no-store')
  async home(@Req() request: AuthenticatedRequest) {
    const user = this.user(request);
    const [dashboard, data] = await Promise.all([
      this.accountDashboardService.getDashboard(request.user!.sub),
      this.questionnaireData(request.user!.sub),
    ]);
    return {
      user,
      dashboard,
      questionnaireProgress: computeQuestionnaireProgress({
        questions: data.questionnaire.questions,
        schools: data.questionnaire.schools,
        savedQuestionnaire: data.savedQuestionnaire,
        fallbackDisplayName: user.displayName,
      }),
      questionnaireAttention: data.savedQuestionnaire?.attention ?? null,
      contactPreferences: data.contactPreferences,
    };
  }

  @Get('profile')
  @Header('Cache-Control', 'private, no-store')
  async profile(@Req() request: AuthenticatedRequest) {
    // Editing a profile does not require loading or repairing match history.
    const user = this.user(request);
    const [data, vip] = await Promise.all([
      this.questionnaireData(request.user!.sub),
      this.vipService.getStatus(request.user!.sub).catch(() => null),
    ]);
    return {
      user,
      ...data,
      vip,
      dashboard: {
        questionnaireSubmittedAt: data.savedQuestionnaire?.submittedAt ?? null,
      },
    };
  }

  @Get('center')
  @Header('Cache-Control', 'private, no-store')
  async center(@Req() request: AuthenticatedRequest) {
    const user = this.user(request);
    const vip = await this.vipService
      .getStatus(request.user!.sub)
      .catch(() => null);
    return { user, vip };
  }
}
