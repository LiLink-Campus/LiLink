import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { releaseMaintenance } from './release-maintenance';
import { CustomThrottlerGuard } from './custom-throttler.guard';
import { CyclesAutomationService } from '../../modules/cycles/cycles-automation.service';
import { RetiredProductEventsService } from '../../modules/retired-product-events/retired-product-events.service';
import { MailService } from '../mail/mail.service';

describe('Release isolation', () => {
  const original = {
    maintenance: env.RELEASE_MAINTENANCE,
    jobs: env.BACKGROUND_JOBS_ENABLED,
    mail: env.MAIL_DELIVERY_ENABLED,
    key: env.RELEASE_ACCESS_KEY,
  };
  afterEach(() => {
    env.RELEASE_MAINTENANCE = original.maintenance;
    env.BACKGROUND_JOBS_ENABLED = original.jobs;
    env.MAIL_DELIVERY_ENABLED = original.mail;
    env.RELEASE_ACCESS_KEY = original.key;
  });
  it('keeps health available and requires the secret for controlled acceptance', () => {
    env.RELEASE_MAINTENANCE = true;
    env.RELEASE_ACCESS_KEY = 'release-test-access-key-1234567890';
    const next = jest.fn();
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const invoke = (path: string, cookie?: string) =>
      releaseMaintenance(
        { path, cookies: { lilink_release_access: cookie } } as never,
        response as never,
        next,
      );
    invoke('/v1/me/dashboard');
    invoke('/v1/me/dashboard', 'forged');
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenNthCalledWith(1, 503);
    invoke('/v1/health');
    invoke('/v1/me/dashboard', env.RELEASE_ACCESS_KEY);
    expect(next).toHaveBeenCalledTimes(2);
  });
  it.each(['maintenance', 'jobs'] as const)(
    'pauses every scheduled writer when %s is disabled',
    async (mode) => {
      env.RELEASE_MAINTENANCE = mode === 'maintenance';
      env.BACKGROUND_JOBS_ENABLED = mode !== 'jobs';
      const cycles = {
        isAutomationDue: jest.fn().mockReturnValue(true),
        runAutomationTick: jest.fn(),
        refreshAutomationSchedule: jest.fn(),
      };
      const events = {
        productEvent: { deleteMany: jest.fn() },
        productEventOutbox: { deleteMany: jest.fn() },
      };
      const mail = new MailService({} as never);
      const flush = jest.spyOn(mail, 'flushQueuedEmails');
      const weekly = { ensureUpcomingCycle: jest.fn() };
      await new CyclesAutomationService(
        cycles as never,
        weekly as never,
      ).handleTick();
      expect(weekly.ensureUpcomingCycle).not.toHaveBeenCalled();
      await new RetiredProductEventsService(events as never).handleRetention();
      await mail.handleEmailQueue();
      expect(cycles.isAutomationDue).not.toHaveBeenCalled();
      expect(events.productEvent.deleteMany).not.toHaveBeenCalled();
      expect(flush).not.toHaveBeenCalled();
    },
  );
  it.each(['maintenance', 'mail'] as const)(
    'blocks targeted queue flushes as well as cron when %s is disabled',
    async (mode) => {
      env.RELEASE_MAINTENANCE = mode === 'maintenance';
      env.MAIL_DELIVERY_ENABLED = mode !== 'mail';
      const findMany = jest.fn();
      await new MailService({
        outboundEmail: { findMany },
      } as never).flushQueuedEmails({ dedupeKeys: ['acceptance'] });
      expect(findMany).not.toHaveBeenCalled();
    },
  );
  it('uses distinct authenticated users behind one IP and rejects forged identity buckets', async () => {
    const guard = Object.create(
      CustomThrottlerGuard.prototype,
    ) as CustomThrottlerGuard & {
      tokenVerifier: JwtService;
      getTracker: (req: unknown) => Promise<string>;
    };
    Object.defineProperty(guard, 'tokenVerifier', { value: new JwtService() });
    const jwt = new JwtService();
    const request = (token: string, originalUrl = '/v1/me/dashboard') => ({
      originalUrl,
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      cookies: { [env.COOKIE_NAME]: token },
    });
    const a = jwt.sign({ sub: 'a' }, { secret: env.JWT_SECRET });
    const b = jwt.sign({ sub: 'b' }, { secret: env.JWT_SECRET });
    const forged = jwt.sign({ sub: 'a' }, { secret: 'wrong-secret' });
    const tracker = (req: unknown) =>
      (
        guard as unknown as { getTracker(req: unknown): Promise<string> }
      ).getTracker(req);
    expect(await tracker(request(a))).toBe('user:a');
    expect(await tracker(request(b))).toBe('user:b');
    expect(await tracker(request(forged))).toBe('127.0.0.1');
    expect(await tracker(request(a, '/v1/auth/login'))).toBe('127.0.0.1');
  });
});
