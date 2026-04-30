import { SchoolResolverService } from './school-resolver.service';
import { PUBLIC_SUPPORTED_SCHOOL_SLUGS } from '@lilink/shared';

describe('SchoolResolverService', () => {
  it('queries candidate suffixes and picks the most specific domain match', async () => {
    const prisma = {
      schoolDomain: {
        findMany: jest.fn().mockResolvedValue([
          {
            domain: 'edu.cn',
            schoolId: 'school-1',
            school: {
              name: '中国传媒大学海南国际学院',
              slug: 'cuc-hainan-international',
              description: 'General domain',
            },
          },
          {
            domain: 'bupt.edu.cn',
            schoolId: 'school-2',
            school: {
              name: '北京邮电大学玛丽女王海南学院',
              slug: 'bupt-qmul-hainan',
              description: 'Specific domain',
            },
          },
        ]),
      },
    };
    const service = new SchoolResolverService(prisma as never);

    await expect(
      service.resolveByEmail('student@mail.bupt.edu.cn'),
    ).resolves.toEqual({
      schoolId: 'school-2',
      matchedDomain: 'bupt.edu.cn',
      schoolName: '北京邮电大学',
      schoolSlug: 'bupt-qmul-hainan',
      schoolDescription: '黎安试验区中外合作办学机构',
      schoolNativeName: '北京邮电大学',
      schoolEnglishName: 'Beijing University of Posts and Telecommunications',
      schoolNativeBaseName: '北京邮电大学',
      schoolEnglishBaseName:
        'Beijing University of Posts and Telecommunications',
    });

    expect(prisma.schoolDomain.findMany).toHaveBeenCalledWith({
      where: {
        domain: {
          in: ['mail.bupt.edu.cn', 'bupt.edu.cn', 'edu.cn', 'cn'],
        },
        school: {
          slug: { in: [...PUBLIC_SUPPORTED_SCHOOL_SLUGS] },
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
              name: '中国传媒大学海南国际学院',
              slug: 'cuc-hainan-international',
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
        schoolName: '中国传媒大学',
        schoolSlug: 'cuc-hainan-international',
        schoolDescription: '黎安试验区合作高校',
        schoolNativeName: '中国传媒大学',
        schoolEnglishName: 'Communication University of China',
        schoolNativeBaseName: '中国传媒大学',
        schoolEnglishBaseName: 'Communication University of China',
      },
    );
    await expect(service.resolveByEmail('other@school.edu')).resolves.toEqual({
      schoolId: 'school-1',
      matchedDomain: 'school.edu',
      schoolName: '中国传媒大学',
      schoolSlug: 'cuc-hainan-international',
      schoolDescription: '黎安试验区合作高校',
      schoolNativeName: '中国传媒大学',
      schoolEnglishName: 'Communication University of China',
      schoolNativeBaseName: '中国传媒大学',
      schoolEnglishBaseName: 'Communication University of China',
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
            name: '中国传媒大学海南国际学院',
            slug: 'cuc-hainan-international',
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
        schoolName: '中国传媒大学',
        schoolSlug: 'cuc-hainan-international',
        schoolDescription: '黎安试验区合作高校',
        schoolNativeName: '中国传媒大学',
        schoolEnglishName: 'Communication University of China',
        schoolNativeBaseName: '中国传媒大学',
        schoolEnglishBaseName: 'Communication University of China',
      },
    );

    service.invalidateResolutionCache();

    await expect(
      service.resolveByEmail('student@school.edu'),
    ).resolves.toBeNull();
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
