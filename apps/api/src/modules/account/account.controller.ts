import { LOCALE_COOKIE_NAME, parseSupportedLocale } from '@lilink/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { createSessionClearCookieOptions } from '../../common/auth/session-config';
import { env } from '../../config/env';
import { AccountDashboardService } from './account-dashboard.service';
import { AccountDeletionService } from './account-deletion.service';
import { AccountParticipationService } from './account-participation.service';
import { AccountProfileService } from './account-profile.service';
import { AccountQuestionnaireService } from './account-questionnaire.service';
import { ContactPreferencesService } from './contact-preferences.service';
import {
  AcknowledgeQuestionnaireItemsDto,
  DashboardResponseDto,
  DeleteAccountDto,
  MatchEstimateRequestDto,
  MatchEstimateResponseDto,
  ReportMatchDto,
  SaveQuestionnaireDto,
  ToggleParticipationDto,
  UpdateContactPreferencesDto,
  UpdateProfileDto,
} from './dto';
import { MatchEstimateService } from './match-estimate.service';
import { MatchReportService } from './match-report.service';

@ApiTags('me')
@Controller('me')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly accountProfileService: AccountProfileService,
    private readonly accountDashboardService: AccountDashboardService,
    private readonly contactPreferencesService: ContactPreferencesService,
    private readonly accountQuestionnaireService: AccountQuestionnaireService,
    private readonly accountParticipationService: AccountParticipationService,
    private readonly matchReportService: MatchReportService,
    private readonly matchEstimateService: MatchEstimateService,
    private readonly accountDeletionService: AccountDeletionService,
  ) {}

  @Delete('account')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async deleteAccount(
    @Req() request: AuthenticatedRequest,
    @Body() body: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.accountDeletionService.deleteAccount(
      request.user!.sub,
      body.password,
    );
    response.clearCookie(env.COOKIE_NAME, createSessionClearCookieOptions());
    return result;
  }

  @Get('dashboard')
  @ApiOperation({
    summary: "Get the signed-in user's dashboard payload.",
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  getDashboard(@Req() request: AuthenticatedRequest) {
    return this.accountDashboardService.getDashboard(request.user!.sub);
  }

  @Get('bootstrap')
  async getDashboardBootstrap(@Req() request: AuthenticatedRequest) {
    const userId = request.user!.sub;
    const [dashboard, user] = await Promise.all([
      this.accountDashboardService.getDashboard(userId),
      this.accountProfileService.getUserSummary(userId),
    ]);
    const cookieLocale = this.readLocaleCookie(request);

    return {
      user: {
        ...user,
        preferredLocale: cookieLocale ?? user.preferredLocale,
      },
      dashboard,
    };
  }

  @Get('profile')
  getProfile(@Req() request: AuthenticatedRequest) {
    return this.accountProfileService.getProfile(request.user!.sub);
  }

  @Put('profile')
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateProfileDto,
  ) {
    return this.accountProfileService.updateProfile(request.user!.sub, body);
  }

  @Get('contact-preferences')
  getContactPreferences(@Req() request: AuthenticatedRequest) {
    return this.contactPreferencesService.getContactPreferences(
      request.user!.sub,
    );
  }

  @Put('contact-preferences')
  updateContactPreferences(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateContactPreferencesDto,
  ) {
    return this.contactPreferencesService.updateContactPreferences(
      request.user!.sub,
      body,
    );
  }

  @Put('locale')
  updateLocale(
    @Req() request: AuthenticatedRequest,
    @Body('locale') rawLocale: unknown,
  ) {
    const locale = parseSupportedLocale(rawLocale);

    if (!locale) {
      throw new BadRequestException('Unsupported locale.');
    }

    return this.accountProfileService.updateLocale(request.user!.sub, {
      locale,
    });
  }

  @Get('questionnaire')
  getQuestionnaire(@Req() request: AuthenticatedRequest) {
    return this.accountQuestionnaireService.getQuestionnaire(request.user!.sub);
  }

  @Put('questionnaire')
  saveQuestionnaire(
    @Req() request: AuthenticatedRequest,
    @Body() body: SaveQuestionnaireDto,
  ) {
    return this.accountQuestionnaireService.saveQuestionnaire(
      request.user!.sub,
      body,
    );
  }

  @Put('questionnaire/acknowledgement')
  acknowledgeQuestionnaireItems(
    @Req() request: AuthenticatedRequest,
    @Body() body: AcknowledgeQuestionnaireItemsDto,
  ) {
    return this.accountQuestionnaireService.acknowledgeQuestionnaireItems(
      request.user!.sub,
      body,
    );
  }

  @Post('match-estimate')
  @ApiOperation({
    summary:
      "Estimate the signed-in user's match-odds band for the given partner-school / partner-gender exclusions.",
  })
  @ApiOkResponse({ type: MatchEstimateResponseDto })
  estimateMatch(
    @Req() request: AuthenticatedRequest,
    @Body() body: MatchEstimateRequestDto,
  ) {
    return this.matchEstimateService.estimate(request.user!.sub, body);
  }

  @Put('participation')
  setParticipation(
    @Req() request: AuthenticatedRequest,
    @Body() body: ToggleParticipationDto,
  ) {
    return this.accountParticipationService.setParticipation(
      request.user!.sub,
      body,
    );
  }

  @Post('matches/:matchId/report')
  reportMatch(
    @Req() request: AuthenticatedRequest,
    @Param('matchId') matchId: string,
    @Body() body: ReportMatchDto,
  ) {
    return this.matchReportService.reportMatch(
      request.user!.sub,
      matchId,
      body,
    );
  }

  private readLocaleCookie(request: AuthenticatedRequest) {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const rawLocale = cookies?.[LOCALE_COOKIE_NAME];

    return parseSupportedLocale(rawLocale);
  }
}
