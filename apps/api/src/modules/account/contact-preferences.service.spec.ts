import { validate } from 'class-validator';
import { ContactPreferencesService } from './contact-preferences.service';
import { UpdateContactPreferencesDto } from './dto';

describe('Contact preferences revision guards', () => {
  it.each([undefined, -1, 1.5, '0', 2147483647])(
    'rejects invalid revision %s at the API boundary',
    async (revision) => {
      const dto = Object.assign(new UpdateContactPreferencesDto(), {
        revision,
        preferredContactChannel: 'EMAIL',
        methods: [],
      });
      expect(await validate(dto)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'revision' }),
        ]),
      );
    },
  );

  it('rejects a stale revision before deleting or replacing contact methods', async () => {
    const deleteMany = jest.fn();
    const upsert = jest.fn();
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          email: 'contact-revision@example.test',
        }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
          userContactMethod: { deleteMany, upsert },
        }),
      ),
    };
    const service = new ContactPreferencesService(prisma as never);
    await expect(
      service.updateContactPreferences('user-1', {
        revision: 0,
        preferredContactChannel: 'WECHAT',
        methods: [{ type: 'WECHAT', value: 'stale_wechat' }],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
