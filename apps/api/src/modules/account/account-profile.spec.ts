import { BadRequestException } from '@nestjs/common';
import { AccountProfileService } from './account-profile.service';
import { createDashboardSnapshotServiceMock } from '../../../test/fixtures/account/account-snapshot.fixtures';
describe('AccountProfileService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('normalizes profile display names before updating the user row', async () => {
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const profileFindUnique = jest.fn().mockResolvedValue(null);
    const dashboardSnapshotService = createDashboardSnapshotServiceMock();
    const service = new AccountProfileService(
      {
        user: {
          update: userUpdate,
        },
        userProfile: {
          findUnique: profileFindUnique,
        },
      } as never,
      dashboardSnapshotService as never,
    );

    await expect(
      service.updateProfile('user-1', { displayName: '  New Name  ' }),
    ).resolves.toBeNull();

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: 'New Name' },
    });
    expect(
      dashboardSnapshotService.syncUserMatchSnapshots,
    ).toHaveBeenCalledWith('user-1');

    await expect(
      service.updateProfile('user-1', { displayName: 'A'.repeat(31) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
