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
  });
});
