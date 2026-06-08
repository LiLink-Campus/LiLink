import { SchoolResolverService } from './school-resolver.service';

describe('SchoolResolverService', () => {
  it('queries candidate suffixes and picks the most specific domain match', async () => {
    const prisma = {
      schoolDomain: {
        findMany: jest.fn().mockResolvedValue([
          {
            domain: 'school.edu',
            schoolId: 'school-1',
            school: {
              name: 'School',
              slug: 'school',
              description: 'General domain',
            },
          },
          {
            domain: 'cs.school.edu',
            schoolId: 'school-2',
            school: {
              name: 'CS School',
              slug: 'cs-school',
              description: 'Specific domain',
            },
          },
        ]),
      },
    };
    const service = new SchoolResolverService(prisma as never);

    await expect(
      service.resolveByEmail('student@mail.cs.school.edu'),
    ).resolves.toEqual({
      schoolId: 'school-2',
      matchedDomain: 'cs.school.edu',
      schoolName: 'CS School',
      schoolSlug: 'cs-school',
      schoolDescription: 'Specific domain',
    });

    expect(prisma.schoolDomain.findMany).toHaveBeenCalledWith({
      where: {
        domain: {
          // The bare TLD "edu" is intentionally excluded from the candidates.
          in: ['mail.cs.school.edu', 'cs.school.edu', 'school.edu'],
        },
      },
      include: {
        school: true,
      },
    });
  });

  it('resolves a two-label organization domain such as bupt.cn', async () => {
    const prisma = {
      schoolDomain: {
        findMany: jest.fn().mockResolvedValue([
          {
            domain: 'bupt.cn',
            schoolId: 'school-bupt',
            school: {
              name: 'BUPT',
              slug: 'bupt',
              description: null,
              registrationEligible: true,
            },
          },
        ]),
      },
    };
    const service = new SchoolResolverService(prisma as never);

    await expect(
      service.resolveByEmail('student@bupt.cn'),
    ).resolves.toMatchObject({
      schoolId: 'school-bupt',
      matchedDomain: 'bupt.cn',
      registrationEligible: true,
    });
  });

  it('never trusts a bare top-level domain even if one is stored', async () => {
    const findMany = jest.fn<
      Promise<unknown>,
      [{ where: { domain: { in: string[] } } }]
    >();
    findMany.mockResolvedValue([
      {
        domain: 'cn',
        schoolId: 'school-x',
        school: {
          name: 'X',
          slug: 'x',
          description: null,
          registrationEligible: true,
        },
      },
    ]);
    const prisma = { schoolDomain: { findMany } };
    const service = new SchoolResolverService(prisma as never);

    // A bare TLD must never grant trusted school-email status: even with a "cn"
    // row in the table, an unrelated *.cn address resolves to null, and "cn" is
    // not even queried as a candidate.
    await expect(
      service.resolveByEmail('attacker@evil.cn'),
    ).resolves.toBeNull();
    expect(findMany.mock.calls[0][0].where.domain.in).not.toContain('cn');
  });

  it('reuses the cached domain resolution inside the TTL window', async () => {
    const prisma = {
      schoolDomain: {
        findMany: jest.fn().mockResolvedValue([
          {
            domain: 'school.edu',
            schoolId: 'school-1',
            school: {
              name: 'School',
              slug: 'school',
              description: 'General domain',
            },
          },
        ]),
      },
    };
    const service = new SchoolResolverService(prisma as never);

    await expect(service.resolveByEmail('student@school.edu')).resolves.toEqual(
      {
        schoolId: 'school-1',
        matchedDomain: 'school.edu',
        schoolName: 'School',
        schoolSlug: 'school',
        schoolDescription: 'General domain',
      },
    );
    await expect(service.resolveByEmail('other@school.edu')).resolves.toEqual({
      schoolId: 'school-1',
      matchedDomain: 'school.edu',
      schoolName: 'School',
      schoolSlug: 'school',
      schoolDescription: 'General domain',
    });

    expect(prisma.schoolDomain.findMany).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached resolutions after school domains change', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          domain: 'school.edu',
          schoolId: 'school-1',
          school: {
            name: 'School',
            slug: 'school',
            description: 'General domain',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    const prisma = {
      schoolDomain: {
        findMany,
      },
    };
    const service = new SchoolResolverService(prisma as never);

    await expect(service.resolveByEmail('student@school.edu')).resolves.toEqual(
      {
        schoolId: 'school-1',
        matchedDomain: 'school.edu',
        schoolName: 'School',
        schoolSlug: 'school',
        schoolDescription: 'General domain',
      },
    );

    service.invalidateResolutionCache();

    await expect(
      service.resolveByEmail('student@school.edu'),
    ).resolves.toBeNull();
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
