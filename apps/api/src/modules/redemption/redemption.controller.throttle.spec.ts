import 'reflect-metadata';
import { RedemptionController } from './redemption.controller';

// Metadata key constants from @nestjs/throttler (see throttler.decorator.js):
// setThrottlerMetadata stores limit as "THROTTLER:LIMIT" + name and
// ttl as "THROTTLER:TTL" + name. For the `default` bucket the keys are
// "THROTTLER:LIMITdefault" and "THROTTLER:TTLdefault".
const THROTTLER_LIMIT_DEFAULT = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_DEFAULT = 'THROTTLER:TTLdefault';

// Both redemption routes must carry a tight throttle cap (§12.7).
describe('RedemptionController throttle metadata', () => {
  it('prepare carries limit=30 / ttl=60000 on the default bucket', () => {
    // Access the method descriptor directly to avoid the unbound-method lint rule.
    const fn = Object.getOwnPropertyDescriptor(
      RedemptionController.prototype,
      'prepare',
    )?.value as object;

    expect(Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, fn)).toBe(30);
    expect(Reflect.getMetadata(THROTTLER_TTL_DEFAULT, fn)).toBe(60_000);
  });

  it('redeem carries limit=30 / ttl=60000 on the default bucket', () => {
    // Access the method descriptor directly to avoid the unbound-method lint rule.
    const fn = Object.getOwnPropertyDescriptor(
      RedemptionController.prototype,
      'redeem',
    )?.value as object;

    expect(Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, fn)).toBe(30);
    expect(Reflect.getMetadata(THROTTLER_TTL_DEFAULT, fn)).toBe(60_000);
  });
});
