import { PrismaService } from '../../src/common/prisma/prisma.service';
import { DashboardSnapshotService } from '../../src/common/dashboard/dashboard-snapshot.service';
import { MailService } from '../../src/common/mail/mail.service';
import { PublicService } from '../../src/modules/public/public.service';
import { CyclesService } from '../../src/modules/cycles/cycles.service';
import { CycleMatchingInputService } from '../../src/modules/cycles/cycle-matching-input.service';
import { CycleMatchingHistoryService } from '../../src/modules/cycles/cycle-matching-history.service';
import { CycleMatchingService } from '../../src/modules/cycles/cycle-matching.service';
import { CyclePreparationStateService } from '../../src/modules/cycles/cycle-preparation-state.service';
import { CyclePreparationService } from '../../src/modules/cycles/cycle-preparation.service';
import { CycleRevealService } from '../../src/modules/cycles/cycle-reveal.service';

type PublicMethods<T> = Pick<T, keyof T>;
type Harness = CyclesService &
  PublicMethods<CycleMatchingInputService> &
  PublicMethods<CycleMatchingService> &
  PublicMethods<CyclePreparationService> &
  PublicMethods<CycleRevealService>;

// Existing domain assertions exercise their new owner. This test-only adapter
// routes old spies to the same owner, with no compatibility path in production.
export function createCycleTestServices(
  prisma: PrismaService,
  snapshots: DashboardSnapshotService,
  mail: MailService,
  publicService = new PublicService(prisma),
): Harness {
  const input = new CycleMatchingInputService(prisma);
  const history = new CycleMatchingHistoryService(prisma);
  const matching = new CycleMatchingService(prisma, input, history);
  const state = new CyclePreparationStateService(prisma);
  const preparation = new CyclePreparationService(
    prisma,
    input,
    matching,
    state,
  );
  const reveal = new CycleRevealService(prisma, snapshots, mail, publicService);
  const cycles = new CyclesService(
    prisma,
    input,
    preparation,
    reveal,
    publicService,
  );
  const owners = [cycles, input, matching, preparation, reveal];
  const bindings = new WeakMap<object, unknown>();
  function ownerFor(key: string | symbol) {
    return owners.find((owner) => key in owner);
  }
  function read(key: string | symbol) {
    const owner = ownerFor(key);
    if (!owner) return undefined;
    const value: unknown = Reflect.get(owner, key);
    if (typeof value !== 'function' || '_isMockFunction' in value) return value;
    if (!bindings.has(value)) bindings.set(value, value.bind(owner));
    return bindings.get(value);
  }
  return new Proxy(cycles, {
    get: (_, key) => read(key),
    set: (_, key, value) => Reflect.set(ownerFor(key) ?? cycles, key, value),
    getOwnPropertyDescriptor: (_, key) => ({
      configurable: true,
      enumerable: true,
      writable: true,
      value: read(key),
    }),
  }) as Harness;
}
