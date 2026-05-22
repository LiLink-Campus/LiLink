import { PublicController } from './public.controller';
import type { PublicService } from './public.service';

describe('PublicController', () => {
  it('returns the landing payload from PublicService', async () => {
    const landing = { hero: 'x' };
    const publicService = {
      getLandingPayload: jest
        .fn<PublicService['getLandingPayload']>()
        .mockResolvedValue(landing),
      getEligibleSchools: jest.fn(),
    } satisfies Pick<PublicService, 'getLandingPayload' | 'getEligibleSchools'>;
    const controller = new PublicController(publicService as never);

    await expect(controller.getLanding()).resolves.toBe(landing);
    expect(publicService.getLandingPayload).toHaveBeenCalledWith();
  });

  it('returns eligible schools from PublicService', async () => {
    const schools = [{ id: 's1', name: 'S' }];
    const publicService = {
      getLandingPayload: jest.fn(),
      getEligibleSchools: jest
        .fn<PublicService['getEligibleSchools']>()
        .mockResolvedValue(schools),
    } satisfies Pick<PublicService, 'getLandingPayload' | 'getEligibleSchools'>;
    const controller = new PublicController(publicService as never);

    await expect(controller.getSchools()).resolves.toBe(schools);
    expect(publicService.getEligibleSchools).toHaveBeenCalledWith();
  });
});
