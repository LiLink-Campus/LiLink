import { CyclesAutomationService } from './cycles-automation.service';

describe('CyclesAutomationService', () => {
  it('delegates each automation tick to CyclesService.runAutomationTick', async () => {
    const runAutomationTick = jest.fn().mockResolvedValue(undefined);
    const service = new CyclesAutomationService({
      runAutomationTick,
    } as never);

    await service.handleTick();

    expect(runAutomationTick).toHaveBeenCalledTimes(1);
  });

  it('does not rethrow when runAutomationTick rejects', async () => {
    const runAutomationTick = jest
      .fn()
      .mockRejectedValue(new Error('tick failed'));
    const service = new CyclesAutomationService({
      runAutomationTick,
    } as never);

    await expect(service.handleTick()).resolves.toBeUndefined();
  });
});
