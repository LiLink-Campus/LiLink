import { AccountController } from './account.controller';

describe('AccountController', () => {
  it('forwards the contact request to the account service for the signed-in user', async () => {
    const accountService = {
      requestContact: jest.fn().mockResolvedValue({ ok: true }),
    };
    const accountController = new AccountController(accountService as never);

    await expect(
      accountController.requestContact(
        {
          user: {
            sub: 'user-1',
          },
        } as never,
        'match-1',
      ),
    ).resolves.toEqual({ ok: true });

    expect(accountService.requestContact).toHaveBeenCalledWith(
      'user-1',
      'match-1',
    );
  });

  it('forwards the report payload to the account service for the signed-in user', async () => {
    const accountService = {
      reportMatch: jest.fn().mockResolvedValue({ ok: true }),
    };
    const accountController = new AccountController(accountService as never);

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
