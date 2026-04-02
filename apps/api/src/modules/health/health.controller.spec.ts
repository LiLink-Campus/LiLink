import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns a health payload', () => {
    const controller = new HealthController();

    const payload = controller.getHealth();

    expect(payload.ok).toBe(true);
    expect(payload.service).toBe('lilink-api');
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });
});
