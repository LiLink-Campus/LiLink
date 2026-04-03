import { UnauthorizedException } from '@nestjs/common';
import { env } from '../../config/env';
import { CyclesController } from './cycles.controller';

describe('CyclesController', () => {
  it('rejects an invalid cron secret', () => {
    const cyclesService = {
      runRevealCycle: jest.fn(),
    };
    const controller = new CyclesController(cyclesService as never);

    expect(() => controller.run('not-the-secret', 'true')).toThrow(
      UnauthorizedException,
    );
    expect(cyclesService.runRevealCycle).not.toHaveBeenCalled();
  });

  it('runs the reveal cycle when the cron secret matches', async () => {
    const cyclesService = {
      runRevealCycle: jest.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new CyclesController(cyclesService as never);

    await expect(controller.run(env.CRON_SECRET, '1')).resolves.toEqual({
      ok: true,
    });
    expect(cyclesService.runRevealCycle).toHaveBeenCalledWith({
      force: true,
    });
  });
});
