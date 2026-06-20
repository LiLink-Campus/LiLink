import { CyclesAutomationService } from './cycles-automation.service';

const buildCyclesService = (overrides: Record<string, unknown> = {}) => ({
  isAutomationDue: jest.fn().mockReturnValue(true),
  runAutomationTick: jest.fn().mockResolvedValue(undefined),
  refreshAutomationSchedule: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('CyclesAutomationService', () => {
  it('skips the tick (no DB work) when automation is not due', async () => {
    const cyclesService = buildCyclesService({
      isAutomationDue: jest.fn().mockReturnValue(false),
    });
    const service = new CyclesAutomationService(cyclesService as never);

    await service.handleTick();

    expect(cyclesService.runAutomationTick).not.toHaveBeenCalled();
    expect(cyclesService.refreshAutomationSchedule).not.toHaveBeenCalled();
  });

  it('runs the tick and refreshes the schedule when due', async () => {
    const cyclesService = buildCyclesService();
    const service = new CyclesAutomationService(cyclesService as never);

    await service.handleTick();

    expect(cyclesService.runAutomationTick).toHaveBeenCalledTimes(1);
    expect(cyclesService.refreshAutomationSchedule).toHaveBeenCalledTimes(1);
  });

  it('still refreshes the schedule when runAutomationTick rejects', async () => {
    const cyclesService = buildCyclesService({
      runAutomationTick: jest.fn().mockRejectedValue(new Error('tick failed')),
    });
    const service = new CyclesAutomationService(cyclesService as never);

    await expect(service.handleTick()).resolves.toBeUndefined();
    expect(cyclesService.refreshAutomationSchedule).toHaveBeenCalledTimes(1);
  });

  it('does not rethrow when refreshAutomationSchedule rejects', async () => {
    const cyclesService = buildCyclesService({
      refreshAutomationSchedule: jest
        .fn()
        .mockRejectedValue(new Error('refresh failed')),
    });
    const service = new CyclesAutomationService(cyclesService as never);

    await expect(service.handleTick()).resolves.toBeUndefined();
  });
});
