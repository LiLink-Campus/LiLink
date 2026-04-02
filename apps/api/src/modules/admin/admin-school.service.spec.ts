import { AdminSchoolService } from './admin-school.service';

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
    const prisma = {
      school: {
        create,
      },
    };
    const service = new AdminSchoolService(
      prisma as never,
      auditService as never,
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
  });
});
