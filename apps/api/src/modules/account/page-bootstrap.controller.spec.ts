import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import type { QuestionnaireService } from '../questionnaire/questionnaire.service';
import type { VipService } from '../vip/vip.service';
import { PageBootstrapController } from './page-bootstrap.controller';

describe('private dashboard page bootstrap', () => {
  const request = {
    user: { sub: 'signed-in-user' },
    cookies: {},
  } as AuthenticatedRequest;
  const account = {
    getUserSummary: jest.fn(),
    getDashboard: jest.fn(),
    getQuestionnaire: jest.fn(),
    getContactPreferences: jest.fn(),
  };
  const questionnaire = { getCurrentVersion: jest.fn() };
  const vip = { getStatus: jest.fn() };
  const controller = new PageBootstrapController(
    account as never,
    account as never,
    account as never,
    account as never,
    questionnaire as unknown as QuestionnaireService,
    vip as unknown as VipService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    account.getUserSummary.mockResolvedValue({
      id: 'signed-in-user',
      preferredLocale: 'zh-CN',
    });
    account.getDashboard.mockResolvedValue({ recentMatchHistory: [] });
    account.getQuestionnaire.mockResolvedValue({
      submittedAt: '2026-09-20T00:00:00.000Z',
    });
    account.getContactPreferences.mockResolvedValue({ methods: [] });
    questionnaire.getCurrentVersion.mockResolvedValue({
      id: 'current',
      questions: [],
    });
    vip.getStatus.mockResolvedValue({ active: false });
  });
  it('loads editable profile data without touching match history', async () => {
    const result = await controller.profile(request);
    expect(result.dashboard.questionnaireSubmittedAt).toBe(
      '2026-09-20T00:00:00.000Z',
    );
    expect(result.questionnaire.id).toBe('current');
    expect(account.getDashboard).not.toHaveBeenCalled();
    expect(account.getQuestionnaire).toHaveBeenCalledWith('signed-in-user');
  });
  it('isolates unavailable VIP status and handles accounts without a response', async () => {
    vip.getStatus.mockRejectedValue(new Error('unavailable'));
    account.getQuestionnaire.mockResolvedValue(null);
    expect(await controller.profile(request)).toMatchObject({
      vip: null,
      savedQuestionnaire: null,
      dashboard: { questionnaireSubmittedAt: null },
    });
  });
  it('does not read questionnaire or history for the user center', async () => {
    expect(await controller.center(request)).toMatchObject({
      user: { id: 'signed-in-user' },
      vip: { active: false },
    });
    expect(account.getQuestionnaire).not.toHaveBeenCalled();
    expect(account.getDashboard).not.toHaveBeenCalled();
  });
  it('retains history and questionnaire progress for the home page', async () => {
    expect(await controller.home(request)).toMatchObject({
      dashboard: { recentMatchHistory: [] },
      questionnaire: { id: 'current' },
    });
    expect(account.getDashboard).toHaveBeenCalledWith('signed-in-user');
  });
  it('propagates core failures instead of returning misleading empty answers', async () => {
    account.getQuestionnaire.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(controller.profile(request)).rejects.toThrow(
      'database unavailable',
    );
  });
});
