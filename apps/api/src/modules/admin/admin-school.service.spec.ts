import { AdminSchoolService } from './admin-school.service';
import { HARD_MATCH_KEYS } from '../questionnaire/hard-match';

describe('AdminSchoolService', () => {
  it('normalizes domains when creating a school', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'school-1',
      slug: 'example-school',
      domains: [],
    });
    const auditService = {
      write: jest.fn().mockResolvedValue(undefined),
    };
    const schoolResolverService = {
      invalidateResolutionCache: jest.fn(),
    };
    const prisma = {
      school: {
        create,
      },
    };
    const service = new AdminSchoolService(
      prisma as never,
      auditService as never,
      undefined,
      schoolResolverService as never,
    );

    await service.create(
      {
        name: 'Example School',
        slug: 'example-school',
        description: 'Example',
        domains: ['Example.edu ', ' sub.example.edu'],
      },
      'admin-1',
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        name: 'Example School',
        slug: 'example-school',
        description: 'Example',
        domains: {
          create: [{ domain: 'example.edu' }, { domain: 'sub.example.edu' }],
        },
      },
      include: {
        domains: true,
      },
    });
    expect(auditService.write).toHaveBeenCalledWith(
      'admin-1',
      'school.created',
      {
        schoolId: 'school-1',
        slug: 'example-school',
      },
    );
    expect(schoolResolverService.invalidateResolutionCache).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rejects school creation when all domains are blank', async () => {
    const service = new AdminSchoolService(
      {
        school: {
          create: jest.fn(),
        },
      } as never,
      {
        write: jest.fn(),
      } as never,
    );

    await expect(
      service.create(
        {
          name: 'Example School',
          slug: 'example-school',
          domains: [' ', ''],
        },
        'admin-1',
      ),
    ).rejects.toThrow('At least one valid email domain is required.');
  });

  it('updates schools in a transaction so domains are replaced atomically', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const update = jest.fn().mockResolvedValue({
      id: 'school-1',
      slug: 'example-school',
      domains: [{ domain: 'example.edu' }],
    });
    const auditService = {
      write: jest.fn().mockResolvedValue(undefined),
    };
    const schoolResolverService = {
      invalidateResolutionCache: jest.fn(),
    };
    const prisma = {
      school: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'school-1',
          slug: 'example-school',
        }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            schoolDomain: { deleteMany },
            school: { update },
          }),
        ),
      ),
    };
    const service = new AdminSchoolService(
      prisma as never,
      auditService as never,
      undefined,
      schoolResolverService as never,
    );

    await service.update(
      'school-1',
      {
        name: 'Example School',
        description: 'Updated',
        domains: ['Example.edu', 'Example.edu', ' sub.example.edu '],
      },
      'admin-1',
    );

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-1' },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'school-1' },
      data: {
        name: 'Example School',
        description: 'Updated',
        domains: {
          create: [{ domain: 'example.edu' }, { domain: 'sub.example.edu' }],
        },
      },
      include: { domains: true },
    });
    expect(schoolResolverService.invalidateResolutionCache).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rewrites questionnaire school references when merging schools', async () => {
    const questionnaireResponse = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'response-1',
          answers: {
            [HARD_MATCH_KEYS.school]: 'school-source',
            [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-third'],
            [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [
              {
                schoolId: 'school-source',
                genders: ['女'],
              },
            ],
          },
          draftAnswers: {
            softAnswers: {
              current_question: 'kept',
            },
            displayName: 'Draft Name',
            hardMatchForm: {
              birthYear: '2000',
              excludedPartnerSchools: ['school-third'],
              excludedPartnerSchoolGenders: [
                {
                  schoolId: 'school-source',
                  genders: ['女'],
                },
              ],
            },
          },
          user: {
            schoolId: 'school-target',
          },
        },
        {
          id: 'response-2',
          answers: {
            [HARD_MATCH_KEYS.school]: 'school-source',
          },
          draftAnswers: null,
          user: {
            schoolId: 'school-target',
          },
        },
      ]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      school: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'school-source',
            name: 'Source School',
            domains: [{ id: 'domain-1', domain: 'source.edu' }],
            _count: { users: 2 },
          })
          .mockResolvedValueOnce({
            id: 'school-target',
            name: 'Target School',
          }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            school: {
              findMany: jest
                .fn()
                .mockResolvedValue([
                  { id: 'school-target' },
                  { id: 'school-third' },
                ]),
              delete: jest.fn().mockResolvedValue(undefined),
            },
            user: {
              updateMany: jest.fn().mockResolvedValue({ count: 2 }),
            },
            schoolDomain: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            questionnaireResponse,
          }),
        ),
      ),
    };
    const auditService = {
      write: jest.fn().mockResolvedValue(undefined),
    };
    const schoolResolverService = {
      invalidateResolutionCache: jest.fn(),
    };
    const service = new AdminSchoolService(
      prisma as never,
      auditService as never,
      undefined,
      schoolResolverService as never,
    );

    await service.merge('school-source', 'school-target', 'admin-1');

    expect(questionnaireResponse.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'response-1' },
      data: {
        answers: {
          [HARD_MATCH_KEYS.school]: 'school-target',
          [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-third'],
          [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [
            {
              schoolId: 'school-target',
              genders: ['女'],
            },
          ],
        },
        draftAnswers: {
          softAnswers: {
            current_question: 'kept',
          },
          displayName: 'Draft Name',
          hardMatchForm: {
            birthYear: '2000',
            excludedPartnerSchools: ['school-third'],
            excludedPartnerSchoolGenders: [
              {
                schoolId: 'school-target',
                genders: ['女'],
              },
            ],
          },
        },
      },
    });
    expect(questionnaireResponse.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'response-2' },
      data: {
        answers: {
          [HARD_MATCH_KEYS.school]: 'school-target',
        },
      },
    });
    expect(schoolResolverService.invalidateResolutionCache).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rewrites questionnaire draft exclusions when deleting schools', async () => {
    const questionnaireResponse = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'response-1',
          answers: {
            [HARD_MATCH_KEYS.school]: 'school-source',
            [HARD_MATCH_KEYS.excludedPartnerSchools]: [
              'school-source',
              'school-third',
            ],
            [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [
              {
                schoolId: 'school-source',
                genders: ['女'],
              },
              {
                schoolId: 'school-third',
                genders: ['男'],
              },
            ],
          },
          draftAnswers: {
            softAnswers: {
              current_question: 'kept',
            },
            displayName: 'Draft Name',
            hardMatchForm: {
              birthYear: '2000',
              excludedPartnerSchools: ['school-source', 'school-third'],
              excludedPartnerSchoolGenders: [
                {
                  schoolId: 'school-source',
                  genders: ['女'],
                },
                {
                  schoolId: 'school-third',
                  genders: ['男'],
                },
              ],
            },
          },
          user: {
            schoolId: 'school-source',
          },
        },
      ]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      school: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'school-source',
          slug: 'source-school',
        }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            school: {
              findMany: jest.fn().mockResolvedValue([{ id: 'school-third' }]),
              delete: jest.fn().mockResolvedValue(undefined),
            },
            schoolDomain: {
              deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            questionnaireResponse,
          }),
        ),
      ),
    };
    const auditService = {
      write: jest.fn().mockResolvedValue(undefined),
    };
    const schoolResolverService = {
      invalidateResolutionCache: jest.fn(),
    };
    const service = new AdminSchoolService(
      prisma as never,
      auditService as never,
      undefined,
      schoolResolverService as never,
    );

    await service.delete('school-source', 'admin-1');

    expect(questionnaireResponse.update).toHaveBeenCalledWith({
      where: { id: 'response-1' },
      data: {
        answers: {
          [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-third'],
          [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [],
        },
        draftAnswers: {
          softAnswers: {
            current_question: 'kept',
          },
          displayName: 'Draft Name',
          hardMatchForm: {
            birthYear: '2000',
            excludedPartnerSchools: ['school-third'],
            excludedPartnerSchoolGenders: [],
          },
        },
      },
    });
    expect(schoolResolverService.invalidateResolutionCache).toHaveBeenCalledTimes(
      1,
    );
  });
});
