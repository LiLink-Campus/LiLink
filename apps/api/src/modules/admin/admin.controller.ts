import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../common/auth/admin.guard';
import type { AdminAuthenticatedRequest } from '../../common/auth/admin.guard';
import {
  AdminUpdateUserDto,
  BatchReviewReportsDto,
  CreateSchoolDto,
  ListAuditLogsQueryDto,
  ListCycleMatchesQueryDto,
  ListCycleParticipantsQueryDto,
  ListCyclesQueryDto,
  ListReportsQueryDto,
  ListSchoolsQueryDto,
  ListUserParticipationsQueryDto,
  ListUsersQueryDto,
  RunCycleDto,
  ReorderQuestionsDto,
  ReviewReportDto,
  ToggleTestFlagDto,
  UpdateUserReferralLimitDto,
  UpdateUserStatusDto,
  UpdateSchoolDto,
  UpsertCycleDto,
  UpsertQuestionDto,
  UpdateWeeklyCycleSettingsDto,
  DeleteCycleDto,
} from './dto';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminUserReadService } from './admin-user-read.service';
import { AdminUserWriteService } from './admin-user-write.service';
import { AdminCycleReadService } from './admin-cycle-read.service';
import { AdminCycleManagementService } from './admin-cycle-management.service';
import { AdminQuestionnaireService } from './admin-questionnaire.service';
import { AdminReportReadService } from './admin-report-read.service';
import { AdminReportReviewService } from './admin-report-review.service';
import { AdminTestDataService } from './admin-test-data.service';
import { AdminSchoolService } from './admin-school.service';
import { AdminAuditService } from './admin-audit.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly users: AdminUserReadService,
    private readonly userWrites: AdminUserWriteService,
    private readonly cycleReads: AdminCycleReadService,
    private readonly cycleManagement: AdminCycleManagementService,
    private readonly questions: AdminQuestionnaireService,
    private readonly reports: AdminReportReadService,
    private readonly reportReviews: AdminReportReviewService,
    private readonly testData: AdminTestDataService,
    private readonly schools: AdminSchoolService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('dashboard')
  getDashboard() {
    return this.dashboard.getDashboard();
  }

  @Get('audit-logs')
  getAuditLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.audit.listAuditLogs(query);
  }

  @Get('schools')
  getSchools(@Query() query: ListSchoolsQueryDto) {
    return this.schools.list(query);
  }

  @Post('schools')
  createSchool(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: CreateSchoolDto,
  ) {
    return this.schools.create(body, request.admin!.id);
  }

  @Put('schools/:schoolId')
  updateSchool(
    @Req() request: AdminAuthenticatedRequest,
    @Param('schoolId') schoolId: string,
    @Body() body: UpdateSchoolDto,
  ) {
    return this.schools.update(schoolId, body, request.admin!.id);
  }

  @Delete('schools/:schoolId')
  deleteSchool(
    @Req() request: AdminAuthenticatedRequest,
    @Param('schoolId') schoolId: string,
  ) {
    return this.schools.delete(schoolId, request.admin!.id);
  }

  @Post('schools/:sourceId/merge-into/:targetId')
  mergeSchools(
    @Req() request: AdminAuthenticatedRequest,
    @Param('sourceId') sourceId: string,
    @Param('targetId') targetId: string,
  ) {
    return this.schools.merge(sourceId, targetId, request.admin!.id);
  }

  @Put('cycles')
  upsertCycle(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: UpsertCycleDto,
  ) {
    return this.cycleManagement.upsertCycle(body, request.admin!.id);
  }

  @Get('cycles')
  getCycles(@Query() query: ListCyclesQueryDto) {
    return this.cycleReads.getCycles(query);
  }

  @Get('cycles/:cycleId')
  getCycleDetail(@Param('cycleId') cycleId: string) {
    return this.cycleReads.getCycleDetail(cycleId);
  }

  @Get('weekly-cycle-settings')
  getWeeklyCycleSettings() {
    return this.cycleManagement.getWeeklyCycleSettings();
  }

  @Put('weekly-cycle-settings')
  updateWeeklyCycleSettings(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: UpdateWeeklyCycleSettingsDto,
  ) {
    return this.cycleManagement.updateWeeklyCycleSettings(
      body,
      request.admin!.id,
    );
  }

  @Delete('cycles/:cycleId')
  deleteCycle(
    @Req() request: AdminAuthenticatedRequest,
    @Param('cycleId') cycleId: string,
    @Body() body: DeleteCycleDto,
  ) {
    return this.cycleManagement.deleteCycle(
      cycleId,
      request.admin!.id,
      body?.expectedParticipationCount,
    );
  }

  @Get('cycles/:cycleId/participants')
  getCycleParticipants(
    @Param('cycleId') cycleId: string,
    @Query() query: ListCycleParticipantsQueryDto,
  ) {
    return this.cycleReads.getCycleParticipants(cycleId, query);
  }

  @Get('cycles/:cycleId/matches')
  getCycleMatches(
    @Param('cycleId') cycleId: string,
    @Query() query: ListCycleMatchesQueryDto,
  ) {
    return this.cycleReads.getCycleMatches(cycleId, query);
  }

  @Get('cycles/:cycleId/preview')
  previewCycle(
    @Param('cycleId') cycleId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.cycleManagement.previewCycle(cycleId, request.admin!.id);
  }

  @Post('cycles/:cycleId/duplicate')
  duplicateCycle(
    @Req() request: AdminAuthenticatedRequest,
    @Param('cycleId') cycleId: string,
  ) {
    return this.cycleManagement.duplicateCycle(cycleId, request.admin!.id);
  }

  @Post('cycles/run')
  runCycle(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: RunCycleDto,
  ) {
    return this.cycleManagement.runCycle(body, request.admin!.id);
  }

  @Get('questionnaire')
  getQuestions() {
    return this.questions.getQuestions();
  }

  @Get('reports')
  getReports(@Query() query: ListReportsQueryDto) {
    return this.reports.getReports(query);
  }

  @Put('questionnaire/questions')
  upsertQuestion(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: UpsertQuestionDto,
  ) {
    return this.questions.upsertQuestion(body, request.admin!.id);
  }

  @Post('questionnaire/questions/reorder')
  reorderQuestions(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: ReorderQuestionsDto,
  ) {
    return this.questions.reorderQuestions(body, request.admin!.id);
  }

  @Delete('questionnaire/questions/:questionId')
  deleteQuestion(
    @Req() request: AdminAuthenticatedRequest,
    @Param('questionId') questionId: string,
  ) {
    return this.questions.deleteQuestion(questionId, request.admin!.id);
  }

  @Put('reports/:reportId')
  reviewReport(
    @Req() request: AdminAuthenticatedRequest,
    @Param('reportId') reportId: string,
    @Body() body: ReviewReportDto,
  ) {
    return this.reportReviews.reviewReport(reportId, body, request.admin!.id);
  }

  @Post('reports/batch-review')
  batchReviewReports(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: BatchReviewReportsDto,
  ) {
    return this.reportReviews.batchReviewReports(body, request.admin!.id);
  }

  @Get('reports/:reportId')
  getReportContext(@Param('reportId') reportId: string) {
    return this.reports.getReportContext(reportId);
  }

  @Put('users/:userId/status')
  updateUserStatus(
    @Req() request: AdminAuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.userWrites.updateUserStatus(userId, body, request.admin!.id);
  }

  @Patch('users/:userId')
  updateUser(
    @Req() request: AdminAuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: AdminUpdateUserDto,
  ) {
    return this.userWrites.updateUser(userId, body, request.admin!.id);
  }

  @Patch('users/:userId/referral-limit')
  updateUserReferralLimit(
    @Req() request: AdminAuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: UpdateUserReferralLimitDto,
  ) {
    return this.userWrites.updateUserReferralLimit(
      userId,
      body,
      request.admin!.id,
    );
  }

  @Put('users/:userId/test-flag')
  toggleTestFlag(
    @Req() request: AdminAuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: ToggleTestFlagDto,
  ) {
    return this.testData.setTestFlag(userId, body.isTest, request.admin!.id);
  }

  @Post('seed-test-users')
  seedTestUsers(@Req() request: AdminAuthenticatedRequest) {
    return this.testData.seedTestUsers(request.admin!.id);
  }

  @Delete('users/test-users')
  deleteTestUsers(@Req() request: AdminAuthenticatedRequest) {
    return this.testData.deleteAllTestUsers(request.admin!.id);
  }

  @Get('users')
  getUsers(@Query() query: ListUsersQueryDto) {
    return this.users.getUsers(query);
  }

  @Get('users/:userId')
  getUserById(@Param('userId') userId: string) {
    return this.users.getUserById(userId);
  }

  @Get('users/:userId/questionnaire')
  getUserQuestionnaire(@Param('userId') userId: string) {
    return this.users.getUserQuestionnaire(userId);
  }

  @Get('users/:userId/participations')
  getUserParticipations(
    @Param('userId') userId: string,
    @Query() query: ListUserParticipationsQueryDto,
  ) {
    return this.users.getUserParticipations(userId, query);
  }
}
