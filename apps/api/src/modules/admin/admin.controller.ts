import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../common/auth/admin.guard';
import type { AdminAuthenticatedRequest } from '../../common/auth/admin.guard';
import {
  BatchReviewReportsDto,
  CreateSchoolDto,
  ListAuditLogsQueryDto,
  ListCyclesQueryDto,
  ListReportsQueryDto,
  ListSchoolsQueryDto,
  ListUsersQueryDto,
  RunCycleDto,
  ReorderQuestionsDto,
  ReviewReportDto,
  UpdateUserStatusDto,
  UpdateSchoolDto,
  UpsertCycleDto,
  UpsertQuestionDto,
} from './dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }

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

  @Get('users')
  getUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.getUsers(query);
  }
}
