import { AdminController } from './admin.controller';

const adminRequest = { admin: { id: 'admin-actor-1' } } as never;

function createAdminServiceMock() {
  return {
    getDashboard: jest.fn().mockResolvedValue({ metrics: {} }),
    getAuditLogs: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getSchools: jest.fn().mockResolvedValue([]),
    createSchool: jest.fn().mockResolvedValue({ id: 's1' }),
    updateSchool: jest.fn().mockResolvedValue({ id: 's1' }),
    deleteSchool: jest.fn().mockResolvedValue({ ok: true }),
    mergeSchools: jest.fn().mockResolvedValue({ ok: true }),
    upsertCycle: jest.fn().mockResolvedValue({ id: 'c1' }),
    getCycles: jest.fn().mockResolvedValue([]),
    getCycleDetail: jest.fn().mockResolvedValue({ id: 'c1' }),
    getCycleParticipants: jest.fn().mockResolvedValue([]),
    getCycleMatches: jest.fn().mockResolvedValue([]),
    getCycleLogs: jest.fn().mockResolvedValue([]),
    previewCycle: jest.fn().mockResolvedValue({ pairs: [] }),
    duplicateCycle: jest.fn().mockResolvedValue({ id: 'c2' }),
    runCycle: jest.fn().mockResolvedValue({ ok: true }),
    getQuestions: jest.fn().mockResolvedValue([]),
    getReports: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    upsertQuestion: jest.fn().mockResolvedValue({ id: 'q1' }),
    reorderQuestions: jest.fn().mockResolvedValue({ ok: true }),
    deleteQuestion: jest.fn().mockResolvedValue({ ok: true }),
    reviewReport: jest.fn().mockResolvedValue({ ok: true }),
    batchReviewReports: jest.fn().mockResolvedValue({ ok: true }),
    getReportContext: jest.fn().mockResolvedValue({ id: 'r1' }),
    updateUserStatus: jest.fn().mockResolvedValue({ ok: true }),
    updateUser: jest.fn().mockResolvedValue({ ok: true }),
    updateUserReferralLimit: jest.fn().mockResolvedValue({ id: 'u1' }),
    setTestFlag: jest.fn().mockResolvedValue({ ok: true }),
    seedTestUsers: jest.fn().mockResolvedValue({ created: 0 }),
    deleteAllTestUsers: jest.fn().mockResolvedValue({ deleted: 0 }),
    getUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getUserById: jest.fn().mockResolvedValue({ id: 'u1' }),
    getUserQuestionnaire: jest.fn().mockResolvedValue(null),
    getUserParticipations: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getSettings: jest.fn().mockResolvedValue({}),
    updateSettings: jest.fn().mockResolvedValue({}),
  };
}

describe('AdminController', () => {
  it('forwards read-only admin routes to AdminService with the same arguments', async () => {
    const adminService = createAdminServiceMock();
    const controller = new AdminController(adminService as never);

    await expect(controller.getDashboard()).resolves.toEqual({ metrics: {} });
    expect(adminService.getDashboard).toHaveBeenCalledWith();

    const auditQuery = { page: 2 } as never;
    await controller.getAuditLogs(auditQuery);
    expect(adminService.getAuditLogs).toHaveBeenCalledWith(auditQuery);

    const schoolsQuery = { search: 'x' } as never;
    await controller.getSchools(schoolsQuery);
    expect(adminService.getSchools).toHaveBeenCalledWith(schoolsQuery);

    const cyclesQuery = { status: 'OPEN' } as never;
    await controller.getCycles(cyclesQuery);
    expect(adminService.getCycles).toHaveBeenCalledWith(cyclesQuery);

    await controller.getCycleDetail('cycle-1');
    expect(adminService.getCycleDetail).toHaveBeenCalledWith('cycle-1');

    const partQuery = { page: 1 } as never;
    await controller.getCycleParticipants('cycle-1', partQuery);
    expect(adminService.getCycleParticipants).toHaveBeenCalledWith(
      'cycle-1',
      partQuery,
    );

    const matchQuery = {} as never;
    await controller.getCycleMatches('cycle-1', matchQuery);
    expect(adminService.getCycleMatches).toHaveBeenCalledWith(
      'cycle-1',
      matchQuery,
    );

    const logQuery = {} as never;
    await controller.getCycleLogs('cycle-1', logQuery);
    expect(adminService.getCycleLogs).toHaveBeenCalledWith('cycle-1', logQuery);

    await controller.previewCycle('cycle-1');
    expect(adminService.previewCycle).toHaveBeenCalledWith('cycle-1');

    await controller.getQuestions();
    expect(adminService.getQuestions).toHaveBeenCalledWith();

    const reportsQuery = { status: 'OPEN' } as never;
    await controller.getReports(reportsQuery);
    expect(adminService.getReports).toHaveBeenCalledWith(reportsQuery);

    await controller.getReportContext('report-1');
    expect(adminService.getReportContext).toHaveBeenCalledWith('report-1');

    const usersQuery = { page: 1 } as never;
    await controller.getUsers(usersQuery);
    expect(adminService.getUsers).toHaveBeenCalledWith(usersQuery);

    await controller.getUserById('user-1');
    expect(adminService.getUserById).toHaveBeenCalledWith('user-1');

    await controller.getUserQuestionnaire('user-1');
    expect(adminService.getUserQuestionnaire).toHaveBeenCalledWith('user-1');

    const upQuery = {} as never;
    await controller.getUserParticipations('user-1', upQuery);
    expect(adminService.getUserParticipations).toHaveBeenCalledWith(
      'user-1',
      upQuery,
    );

    await controller.getSettings();
    expect(adminService.getSettings).toHaveBeenCalledWith();
  });

  it('forwards mutating admin routes and passes the authenticated admin actor id', async () => {
    const adminService = createAdminServiceMock();
    const controller = new AdminController(adminService as never);

    const schoolBody = { name: 'School' } as never;
    await controller.createSchool(adminRequest, schoolBody);
    expect(adminService.createSchool).toHaveBeenCalledWith(
      schoolBody,
      'admin-actor-1',
    );

    const updateSchoolBody = { name: 'Renamed' } as never;
    await controller.updateSchool(adminRequest, 'school-1', updateSchoolBody);
    expect(adminService.updateSchool).toHaveBeenCalledWith(
      'school-1',
      updateSchoolBody,
      'admin-actor-1',
    );

    await controller.deleteSchool(adminRequest, 'school-1');
    expect(adminService.deleteSchool).toHaveBeenCalledWith(
      'school-1',
      'admin-actor-1',
    );

    await controller.mergeSchools(adminRequest, 's-src', 's-tgt');
    expect(adminService.mergeSchools).toHaveBeenCalledWith(
      's-src',
      's-tgt',
      'admin-actor-1',
    );

    const cycleBody = { id: 'cycle-1' } as never;
    await controller.upsertCycle(adminRequest, cycleBody);
    expect(adminService.upsertCycle).toHaveBeenCalledWith(
      cycleBody,
      'admin-actor-1',
    );

    await controller.duplicateCycle(adminRequest, 'cycle-1');
    expect(adminService.duplicateCycle).toHaveBeenCalledWith(
      'cycle-1',
      'admin-actor-1',
    );

    const runBody = { cycleId: 'cycle-1', force: false } as never;
    await controller.runCycle(adminRequest, runBody);
    expect(adminService.runCycle).toHaveBeenCalledWith(
      runBody,
      'admin-actor-1',
    );

    const qBody = { id: 'q1' } as never;
    await controller.upsertQuestion(adminRequest, qBody);
    expect(adminService.upsertQuestion).toHaveBeenCalledWith(
      qBody,
      'admin-actor-1',
    );

    const reorderBody = { orderedIds: ['a', 'b'] } as never;
    await controller.reorderQuestions(adminRequest, reorderBody);
    expect(adminService.reorderQuestions).toHaveBeenCalledWith(
      reorderBody,
      'admin-actor-1',
    );

    await controller.deleteQuestion(adminRequest, 'q-9');
    expect(adminService.deleteQuestion).toHaveBeenCalledWith(
      'q-9',
      'admin-actor-1',
    );

    const reviewBody = { status: 'RESOLVED' } as never;
    await controller.reviewReport(adminRequest, 'r-1', reviewBody);
    expect(adminService.reviewReport).toHaveBeenCalledWith(
      'r-1',
      reviewBody,
      'admin-actor-1',
    );

    const batchBody = { reportIds: ['r-1'], status: 'DISMISSED' } as never;
    await controller.batchReviewReports(adminRequest, batchBody);
    expect(adminService.batchReviewReports).toHaveBeenCalledWith(
      batchBody,
      'admin-actor-1',
    );

    const statusBody = { status: 'ACTIVE' } as never;
    await controller.updateUserStatus(adminRequest, 'u-1', statusBody);
    expect(adminService.updateUserStatus).toHaveBeenCalledWith(
      'u-1',
      statusBody,
      'admin-actor-1',
    );

    const patchUserBody = { displayName: 'N' } as never;
    await controller.updateUser(adminRequest, 'u-1', patchUserBody);
    expect(adminService.updateUser).toHaveBeenCalledWith(
      'u-1',
      patchUserBody,
      'admin-actor-1',
    );

    const referralLimitBody = { nonEduReferralLimit: 10 } as never;
    await controller.updateUserReferralLimit(
      adminRequest,
      'u-1',
      referralLimitBody,
    );
    expect(adminService.updateUserReferralLimit).toHaveBeenCalledWith(
      'u-1',
      referralLimitBody,
      'admin-actor-1',
    );

    await controller.toggleTestFlag(adminRequest, 'u-1', { isTest: true });
    expect(adminService.setTestFlag).toHaveBeenCalledWith(
      'u-1',
      true,
      'admin-actor-1',
    );

    await controller.seedTestUsers(adminRequest);
    expect(adminService.seedTestUsers).toHaveBeenCalledWith('admin-actor-1');

    await controller.deleteTestUsers(adminRequest);
    expect(adminService.deleteAllTestUsers).toHaveBeenCalledWith(
      'admin-actor-1',
    );

    const settingsPatch = { key: 'value' };
    await controller.updateSettings(adminRequest, settingsPatch);
    expect(adminService.updateSettings).toHaveBeenCalledWith(
      settingsPatch,
      'admin-actor-1',
    );
  });
});
