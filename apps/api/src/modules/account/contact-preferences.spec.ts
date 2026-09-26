import { ContactPreferencesService } from './contact-preferences.service';
describe('ContactPreferencesService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('saves contact preferences with normalized international phone numbers', async () => {
    const userUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const upsert = jest.fn().mockResolvedValue(undefined);
    const findMany = jest.fn().mockResolvedValue([
      {
        type: 'PHONE',
        value: '+8613800138000',
      },
      {
        type: 'WECHAT',
        value: 'wx_user',
      },
    ]);
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user-1@example.com',
          preferredContactChannel: 'EMAIL',
        }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          user: {
            updateMany: userUpdate,
          },
          userContactMethod: {
            deleteMany,
            upsert,
            findMany,
          },
        }),
      ),
    };
    const service = new ContactPreferencesService(prisma as never);

    await expect(
      service.updateContactPreferences('user-1', {
        revision: 0,
        preferredContactChannel: 'PHONE',
        methods: [
          { type: 'PHONE', value: '+86 138 0013 8000' },
          { type: 'WECHAT', value: ' wx_user ' },
        ],
      }),
    ).resolves.toEqual({
      revision: 1,
      email: 'user-1@example.com',
      preferredContactChannel: 'PHONE',
      methods: [
        { type: 'PHONE', value: '+8613800138000' },
        { type: 'WECHAT', value: 'wx_user' },
      ],
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        contactPreferencesRevision: 0,
        deactivatedAt: null,
      },
      data: {
        preferredContactChannel: 'PHONE',
        contactPreferencesRevision: { increment: 1 },
      },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: {
          in: ['QQ'],
        },
      },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: {
        userId_type: {
          userId: 'user-1',
          type: 'PHONE',
        },
      },
      update: {
        value: '+8613800138000',
        normalizedValue: '+8613800138000',
      },
      create: {
        userId: 'user-1',
        type: 'PHONE',
        value: '+8613800138000',
        normalizedValue: '+8613800138000',
      },
    });
  });
  it('rejects choosing a non-email contact channel that has no value', async () => {
    const service = new ContactPreferencesService({} as never);

    await expect(
      service.updateContactPreferences('user-1', {
        revision: 0,
        preferredContactChannel: 'QQ',
        methods: [{ type: 'WECHAT', value: 'wx_user' }],
      }),
    ).rejects.toMatchObject({
      message: 'Selected contact channel must have a value.',
    });
  });
});
