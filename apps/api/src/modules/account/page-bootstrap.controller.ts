import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { LOCALE_COOKIE_NAME, parseSupportedLocale } from '@lilink/shared';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { VipService } from '../vip/vip.service';
import { AccountService } from './account.service';

@Controller('me/page-bootstrap')
@UseGuards(JwtAuthGuard)
export class PageBootstrapController {
  constructor(
    private readonly accountService: AccountService,
    private readonly questionnaireService: QuestionnaireService,
    private readonly vipService: VipService,
  ) {}

  private async user(request: AuthenticatedRequest) {
    const user = await this.accountService.getUserSummary(request.user!.sub);
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
        this.accountService.getQuestionnaire(userId),
        this.accountService.getContactPreferences(userId),
      ]);
    return { questionnaire, savedQuestionnaire, contactPreferences };
  }

  @Get('home')
  @Header('Cache-Control', 'private, no-store')
  async home(@Req() request: AuthenticatedRequest) {
    const [user, dashboard, data] = await Promise.all([
      this.user(request),
      this.accountService.getDashboard(request.user!.sub),
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
