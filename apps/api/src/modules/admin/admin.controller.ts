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
  ListCycleLogsQueryDto,
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
  UpdateUserStatusDto,
  UpdateSettingsDto,
  UpdateSchoolDto,
  UpsertCycleDto,
  UpsertQuestionDto,
} from './dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('audit-logs')
  getAuditLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.adminService.getAuditLogs(query);
  }

  @Get('schools')
  getSchools(@Query() query: ListSchoolsQueryDto) {
    return this.adminService.getSchools(query);
  }

  @Post('schools')
  createSchool(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: CreateSchoolDto,
  ) {
    return this.adminService.createSchool(body, request.admin!.id);
  }

  @Put('schools/:schoolId')
  updateSchool(
    @Req() request: AdminAuthenticatedRequest,
    @Param('schoolId') schoolId: string,
    @Body() body: UpdateSchoolDto,
  ) {
    return this.adminService.updateSchool(schoolId, body, request.admin!.id);
  }

  @Delete('schools/:schoolId')
  deleteSchool(
    @Req() request: AdminAuthenticatedRequest,
    @Param('schoolId') schoolId: string,
  ) {
    return this.adminService.deleteSchool(schoolId, request.admin!.id);
  }

  @Post('schools/:sourceId/merge-into/:targetId')
  mergeSchools(
    @Req() request: AdminAuthenticatedRequest,
    @Param('sourceId') sourceId: string,
    @Param('targetId') targetId: string,
  ) {
    return this.adminService.mergeSchools(
      sourceId,
      targetId,
      request.admin!.id,
    );
  }

  @Put('cycles')
  upsertCycle(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: UpsertCycleDto,
  ) {
    return this.adminService.upsertCycle(body, request.admin!.id);
  }

  @Get('cycles')
  getCycles(@Query() query: ListCyclesQueryDto) {
    return this.adminService.getCycles(query);
  }

  @Get('cycles/:cycleId')
  getCycleDetail(@Param('cycleId') cycleId: string) {
    return this.adminService.getCycleDetail(cycleId);
  }

  @Get('cycles/:cycleId/participants')
  getCycleParticipants(
    @Param('cycleId') cycleId: string,
    @Query() query: ListCycleParticipantsQueryDto,
  ) {
    return this.adminService.getCycleParticipants(cycleId, query);
  }

  @Get('cycles/:cycleId/matches')
  getCycleMatches(
    @Param('cycleId') cycleId: string,
    @Query() query: ListCycleMatchesQueryDto,
  ) {
    return this.adminService.getCycleMatches(cycleId, query);
  }

  @Get('cycles/:cycleId/logs')
  getCycleLogs(
    @Param('cycleId') cycleId: string,
    @Query() query: ListCycleLogsQueryDto,
  ) {
    return this.adminService.getCycleLogs(cycleId, query);
  }

  @Get('cycles/:cycleId/preview')
  previewCycle(@Param('cycleId') cycleId: string) {
    return this.adminService.previewCycle(cycleId);
  }

  @Post('cycles/:cycleId/duplicate')
  duplicateCycle(
    @Req() request: AdminAuthenticatedRequest,
    @Param('cycleId') cycleId: string,
  ) {
    return this.adminService.duplicateCycle(cycleId, request.admin!.id);
  }

  @Post('cycles/run')
  runCycle(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: RunCycleDto,
  ) {
    return this.adminService.runCycle(body, request.admin!.id);
  }

  @Get('questionnaire')
  getQuestions() {
    return this.adminService.getQuestions();
  }

  @Get('reports')
  getReports(@Query() query: ListReportsQueryDto) {
    return this.adminService.getReports(query);
  }

  @Put('questionnaire/questions')
  upsertQuestion(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: UpsertQuestionDto,
  ) {
    return this.adminService.upsertQuestion(body, request.admin!.id);
  }

  @Post('questionnaire/questions/reorder')
  reorderQuestions(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: ReorderQuestionsDto,
  ) {
    return this.adminService.reorderQuestions(body, request.admin!.id);
  }

  @Delete('questionnaire/questions/:questionId')
  deleteQuestion(
    @Req() request: AdminAuthenticatedRequest,
    @Param('questionId') questionId: string,
  ) {
    return this.adminService.deleteQuestion(questionId, request.admin!.id);
  }

  @Put('reports/:reportId')
  reviewReport(
    @Req() request: AdminAuthenticatedRequest,
    @Param('reportId') reportId: string,
    @Body() body: ReviewReportDto,
  ) {
    return this.adminService.reviewReport(reportId, body, request.admin!.id);
  }

  @Post('reports/batch-review')
  batchReviewReports(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: BatchReviewReportsDto,
  ) {
    return this.adminService.batchReviewReports(body, request.admin!.id);
  }

  @Get('reports/:reportId')
  getReportContext(@Param('reportId') reportId: string) {
    return this.adminService.getReportContext(reportId);
  }

  @Put('users/:userId/status')
  updateUserStatus(
    @Req() request: AdminAuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(userId, body, request.admin!.id);
  }

  @Patch('users/:userId')
  updateUser(
    @Req() request: AdminAuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: AdminUpdateUserDto,
  ) {
    return this.adminService.updateUser(userId, body, request.admin!.id);
  }

  @Put('users/:userId/test-flag')
  toggleTestFlag(
    @Req() request: AdminAuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: ToggleTestFlagDto,
  ) {
    return this.adminService.setTestFlag(
      userId,
      body.isTest,
      request.admin!.id,
    );
  }

  @Post('seed-test-users')
  seedTestUsers(@Req() request: AdminAuthenticatedRequest) {
    return this.adminService.seedTestUsers(request.admin!.id);
  }

  @Delete('users/test-users')
  deleteTestUsers(@Req() request: AdminAuthenticatedRequest) {
    return this.adminService.deleteAllTestUsers(request.admin!.id);
  }

  @Get('users')
  getUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Get('users/:userId')
  getUserById(@Param('userId') userId: string) {
    return this.adminService.getUserById(userId);
  }

  @Get('users/:userId/questionnaire')
  getUserQuestionnaire(@Param('userId') userId: string) {
    return this.adminService.getUserQuestionnaire(userId);
  }

  @Get('users/:userId/participations')
  getUserParticipations(
    @Param('userId') userId: string,
    @Query() query: ListUserParticipationsQueryDto,
  ) {
    return this.adminService.getUserParticipations(userId, query);
  }

  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: UpdateSettingsDto,
  ) {
    return this.adminService.updateSettings(body, request.admin!.id);
  }
}
