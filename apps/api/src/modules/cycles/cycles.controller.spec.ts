import { UnauthorizedException } from '@nestjs/common';
import { env } from '../../config/env';
import { CyclesController } from './cycles.controller';

describe('CyclesController', () => {
  it('rejects an invalid cron secret', () => {
    const cyclesService = {
      runAutomationTick: jest.fn(),
    };
    const controller = new CyclesController(cyclesService as never);

    expect(() => controller.run('not-the-secret')).toThrow(
      UnauthorizedException,
    );
    expect(cyclesService.runAutomationTick).not.toHaveBeenCalled();
  });

  it('runs the automation tick when the cron secret matches', async () => {
    const cyclesService = {
      runAutomationTick: jest.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new CyclesController(cyclesService as never);

    await expect(controller.run(env.CRON_SECRET)).resolves.toEqual({
      ok: true,
    });
    expect(cyclesService.runAutomationTick).toHaveBeenCalledTimes(1);
  });
});
