import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import {
  AcceptMeetupOptionsDto,
  CancelMeetupSessionDto,
  CreateMeetupProposalDto,
  MeetupLocationCandidateResponseDto,
  MeetupSessionResponseDto,
  RejectMeetupProposalDto,
  ReviseMeetupSessionDto,
  StartMeetupSessionDto,
} from './dto';
import { MeetupService } from './meetup.service';

@ApiTags('meetup')
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeetupController {
  constructor(private readonly meetupService: MeetupService) {}

  @Get('meetup-location-candidates')
  @ApiOkResponse({ type: MeetupLocationCandidateResponseDto, isArray: true })
  getLocationCandidates() {
    return this.meetupService.getLocationCandidates();
  }

  @Get('meetup-sessions/:sessionId')
  @ApiOkResponse({ type: MeetupSessionResponseDto })
  getSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    return this.meetupService.getSession(request.user!.sub, sessionId);
  }

  @Post('matches/:matchId/meetup/start')
  @ApiOkResponse({ type: MeetupSessionResponseDto })
  startSession(
    @Req() request: AuthenticatedRequest,
    @Param('matchId') matchId: string,
    @Body() body: StartMeetupSessionDto,
  ) {
    return this.meetupService.startSession(request.user!.sub, matchId, body);
  }

  @Post('meetup-sessions/:sessionId/proposals')
  @ApiOkResponse({ type: MeetupSessionResponseDto })
  createProposal(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: CreateMeetupProposalDto,
  ) {
    return this.meetupService.createProposal(
      request.user!.sub,
      sessionId,
      body,
    );
  }

  @Post('meetup-sessions/:sessionId/options/accept')
  @ApiOkResponse({ type: MeetupSessionResponseDto })
  acceptOptions(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: AcceptMeetupOptionsDto,
  ) {
    return this.meetupService.acceptOptions(request.user!.sub, sessionId, body);
  }

  @Post('meetup-sessions/:sessionId/proposals/:proposalId/reject')
  @ApiOkResponse({ type: MeetupSessionResponseDto })
  rejectProposal(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: RejectMeetupProposalDto,
  ) {
    return this.meetupService.rejectProposal(
      request.user!.sub,
      sessionId,
      proposalId,
      body,
    );
  }

  @Post('meetup-sessions/:sessionId/final-confirm')
  @ApiOkResponse({ type: MeetupSessionResponseDto })
  finalConfirm(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    return this.meetupService.finalConfirm(request.user!.sub, sessionId);
  }

  @Post('meetup-sessions/:sessionId/revise')
  @ApiOkResponse({ type: MeetupSessionResponseDto })
  reviseAfterLock(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: ReviseMeetupSessionDto,
  ) {
    return this.meetupService.reviseAfterLock(
      request.user!.sub,
      sessionId,
      body,
    );
  }

  @Post('meetup-sessions/:sessionId/cancel')
  @ApiOkResponse({ type: MeetupSessionResponseDto })
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: CancelMeetupSessionDto,
  ) {
    return this.meetupService.cancel(request.user!.sub, sessionId, body);
  }

  @Post('meetup-sessions/:sessionId/seen')
  @HttpCode(204)
  @ApiNoContentResponse()
  async markSeen(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    await this.meetupService.markSeen(request.user!.sub, sessionId);
  }
}
