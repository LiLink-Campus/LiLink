import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { AccountService } from './account.service';
import {
  ReportMatchDto,
  SaveQuestionnaireDto,
  ToggleParticipationDto,
  UpdateProfileDto,
} from './dto';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('dashboard')
  getDashboard(@Req() request: AuthenticatedRequest) {
    return this.accountService.getDashboard(request.user!.sub);
  }

  @Get('profile')
  getProfile(@Req() request: AuthenticatedRequest) {
    return this.accountService.getProfile(request.user!.sub);
  }

  @Put('profile')
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateProfileDto,
  ) {
    return this.accountService.updateProfile(request.user!.sub, body);
  }

  @Get('questionnaire')
  getQuestionnaire(@Req() request: AuthenticatedRequest) {
    return this.accountService.getQuestionnaire(request.user!.sub);
  }

  @Put('questionnaire')
  saveQuestionnaire(
    @Req() request: AuthenticatedRequest,
    @Body() body: SaveQuestionnaireDto,
  ) {
    return this.accountService.saveQuestionnaire(request.user!.sub, body);
  }

  @Put('participation')
  setParticipation(
    @Req() request: AuthenticatedRequest,
    @Body() body: ToggleParticipationDto,
  ) {
    return this.accountService.setParticipation(request.user!.sub, body);
  }

  @Post('matches/:matchId/contact')
  requestContact(
    @Req() request: AuthenticatedRequest,
    @Param('matchId') matchId: string,
  ) {
    return this.accountService.requestContact(request.user!.sub, matchId);
  }

  @Post('matches/:matchId/report')
  reportMatch(
    @Req() request: AuthenticatedRequest,
    @Param('matchId') matchId: string,
    @Body() body: ReportMatchDto,
  ) {
    return this.accountService.reportMatch(request.user!.sub, matchId, body);
  }
}
