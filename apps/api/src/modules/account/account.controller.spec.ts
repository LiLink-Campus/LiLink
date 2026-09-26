import type { AccountDashboardService } from './account-dashboard.service';
import type { AccountProfileService } from './account-profile.service';
import { AccountController } from './account.controller';

describe('AccountController', () => {
  it('returns the signed-in user and dashboard in one bootstrap payload', async () => {
    const dashboard = { currentCycle: null };
    const userSummary = {
      id: 'user-1',
      email: 'summary@example.com',
      displayName: 'Summary User',
      preferredLocale: 'zh-CN',
    };
    const accountService = {
      getDashboard: jest
        .fn<AccountDashboardService['getDashboard']>()
        .mockResolvedValue(dashboard),
      getUserSummary: jest
        .fn<AccountProfileService['getUserSummary']>()
        .mockResolvedValue(userSummary),
    } satisfies Pick<AccountDashboardService, 'getDashboard'> &
      Pick<AccountProfileService, 'getUserSummary'>;
    const accountController = new AccountController(
      accountService as never,
      accountService as never,
      accountService as never,
      accountService as never,
      accountService as never,
      accountService as never,
      {} as never,
      {} as never,
    );

    await expect(
      accountController.getDashboardBootstrap({
        user: {
          sub: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
        },
      } as never),
    ).resolves.toEqual({
      user: userSummary,
      dashboard,
    });

    expect(accountService.getDashboard).toHaveBeenCalledWith('user-1');
    expect(accountService.getUserSummary).toHaveBeenCalledWith('user-1');
  });

  it('forwards the report payload to the account service for the signed-in user', async () => {
    const accountService = {
      reportMatch: jest.fn().mockResolvedValue({ ok: true }),
    };
    const accountController = new AccountController(
      accountService as never,
      accountService as never,
      accountService as never,
      accountService as never,
      accountService as never,
      accountService as never,
      {} as never,
      {} as never,
    );

    await expect(
      accountController.reportMatch(
        {
          user: {
            sub: 'user-1',
          },
        } as never,
        'match-1',
        {
          reason: '骚扰',
          details: 'test details',
        },
      ),
    ).resolves.toEqual({ ok: true });

    expect(accountService.reportMatch).toHaveBeenCalledWith(
      'user-1',
      'match-1',
      {
        reason: '骚扰',
        details: 'test details',
      },
    );
  });
});
