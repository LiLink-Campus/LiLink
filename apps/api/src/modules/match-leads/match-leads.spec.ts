import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMatchLeadDto, MatchLeadsController } from './match-leads.module';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../common/prisma/client';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
const valid = {
  realName: ' 测试同学 ',
  school: '测试大学',
  major: '计算机',
  contact: '+8613800138000',
  consent: true,
};
describe('Match lead input', () => {
  it.each(['wechat_id', '13800138000', '+86123'])(
    'rejects invalid phone %s',
    async (contact) => {
      expect(
        (
          await validate(
            plainToInstance(CreateMatchLeadDto, { ...valid, contact }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it('trims all required information', async () => {
    const dto = plainToInstance(CreateMatchLeadDto, valid);
    expect(dto.realName).toBe('测试同学');
    expect(await validate(dto)).toHaveLength(0);
  });
  it.each(['realName', 'school', 'major', 'contact', 'consent'])(
    'rejects missing %s',
    async (key) => {
      expect(
        (
          await validate(
            plainToInstance(CreateMatchLeadDto, { ...valid, [key]: undefined }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it('rejects whitespace and missing consent', async () => {
    expect(
      (
        await validate(
          plainToInstance(CreateMatchLeadDto, {
            ...valid,
            major: '   ',
            consent: false,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('takes account identity only from the authenticated request', async () => {
    const upsert = jest
      .fn<Promise<unknown>, [Prisma.MatchLeadUpsertArgs]>()
      .mockResolvedValue({});
    const controller = new MatchLeadsController({
      matchLead: { upsert },
    } as unknown as PrismaService);
    await controller.create(
      { user: { sub: 'account-one' } } as AuthenticatedRequest,
      plainToInstance(CreateMatchLeadDto, valid),
    );
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      where: { userId: 'account-one' },
      create: { userId: 'account-one', major: '计算机' },
    });
    await expect(
      controller.create(
        {} as AuthenticatedRequest,
        plainToInstance(CreateMatchLeadDto, valid),
      ),
    ).rejects.toThrow();
  });
});
