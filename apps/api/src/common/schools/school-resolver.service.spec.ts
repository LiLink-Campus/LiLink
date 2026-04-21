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
          in: ['mail.cs.school.edu', 'cs.school.edu', 'school.edu', 'edu'],
        },
      },
      include: {
        school: true,
      },
    });
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

    await expect(service.resolveByEmail('student@school.edu')).resolves.toEqual({
      schoolId: 'school-1',
      matchedDomain: 'school.edu',
      schoolName: 'School',
      schoolSlug: 'school',
      schoolDescription: 'General domain',
    });
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

    await expect(service.resolveByEmail('student@school.edu')).resolves.toEqual({
      schoolId: 'school-1',
      matchedDomain: 'school.edu',
      schoolName: 'School',
      schoolSlug: 'school',
      schoolDescription: 'General domain',
    });

    service.invalidateResolutionCache();

    await expect(service.resolveByEmail('student@school.edu')).resolves.toBeNull();
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
