import { LOCALE_COOKIE_NAME, parseSupportedLocale } from '@lilink/shared';
import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { VipService } from '../vip/vip.service';
import { AccountDashboardService } from './account-dashboard.service';
import { AccountProfileService } from './account-profile.service';
import { AccountQuestionnaireService } from './account-questionnaire.service';
import { ContactPreferencesService } from './contact-preferences.service';

@Controller('me/page-bootstrap')
@UseGuards(JwtAuthGuard)
export class PageBootstrapController {
  constructor(
    private readonly accountProfileService: AccountProfileService,
    private readonly accountDashboardService: AccountDashboardService,
    private readonly contactPreferencesService: ContactPreferencesService,
    private readonly accountQuestionnaireService: AccountQuestionnaireService,
    private readonly questionnaireService: QuestionnaireService,
    private readonly vipService: VipService,
  ) {}

  private async user(request: AuthenticatedRequest) {
    const user = await this.accountProfileService.getUserSummary(
      request.user!.sub,
    );
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
    const [user, dashboard, data] = await Promise.all([
      this.user(request),
      this.accountDashboardService.getDashboard(request.user!.sub),
      this.questionnaireData(request.user!.sub),
    ]);
    return { user, dashboard, ...data };
  }

  @Get('profile')
  @Header('Cache-Control', 'private, no-store')
  async profile(@Req() request: AuthenticatedRequest) {
    // Editing a profile does not require loading or repairing match history.
    const [user, data, vip] = await Promise.all([
      this.user(request),
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
    const [user, vip] = await Promise.all([
      this.user(request),
      this.vipService.getStatus(request.user!.sub).catch(() => null),
    ]);
    return { user, vip };
  }
}
