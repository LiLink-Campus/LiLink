import { PrismaService } from '../../src/common/prisma/prisma.service';
import { DashboardSnapshotService } from '../../src/common/dashboard/dashboard-snapshot.service';
import { QuestionnaireService } from '../../src/modules/questionnaire/questionnaire.service';
import { CyclesService } from '../../src/modules/cycles/cycles.service';
import { CycleMatchingService } from '../../src/modules/cycles/cycle-matching.service';
import { WeeklyCycleService } from '../../src/modules/cycles/weekly-cycle.service';
import { AdminAuditService } from '../../src/modules/admin/admin-audit.service';
import { AdminSchoolService } from '../../src/modules/admin/admin-school.service';
import { AdminDashboardService } from '../../src/modules/admin/admin-dashboard.service';
import { AdminUserReadService } from '../../src/modules/admin/admin-user-read.service';
import { AdminUserWriteService } from '../../src/modules/admin/admin-user-write.service';
import { AdminCycleReadService } from '../../src/modules/admin/admin-cycle-read.service';
import { AdminCycleManagementService } from '../../src/modules/admin/admin-cycle-management.service';
import { AdminReportReadService } from '../../src/modules/admin/admin-report-read.service';
import { AdminReportReviewService } from '../../src/modules/admin/admin-report-review.service';
import { AdminQuestionnaireService } from '../../src/modules/admin/admin-questionnaire.service';
import { AdminQuestionnaireRevisionService } from '../../src/modules/admin/admin-questionnaire-revision.service';
import { AdminTestDataService } from '../../src/modules/admin/admin-test-data.service';

type PublicMethods<T> = Pick<T, keyof T>;
export type AdminTestHarness = PublicMethods<AdminDashboardService> &
  PublicMethods<AdminUserReadService> &
  PublicMethods<AdminUserWriteService> &
  PublicMethods<AdminCycleReadService> &
  PublicMethods<AdminCycleManagementService> &
  PublicMethods<AdminReportReadService> &
  PublicMethods<AdminReportReviewService> &
  PublicMethods<AdminQuestionnaireService> &
  PublicMethods<AdminTestDataService>;

// Existing assertions call their new owner; production controllers inject it directly.
export function createAdminTestHarness(
  prisma: PrismaService,
  cycles: CyclesService,
  audit: AdminAuditService,
  _schools: AdminSchoolService,
  snapshots = {
    syncCycleSnapshots: () => Promise.resolve(),
    syncMatchSnapshots: () => Promise.resolve(),
    syncUserMatchSnapshots: () => Promise.resolve(),
  } as unknown as DashboardSnapshotService,
  questionnaire = {
    invalidateCurrentQuestionnaireCache: () => undefined,
  } as unknown as QuestionnaireService,
  weekly = new WeeklyCycleService(prisma),
): AdminTestHarness {
  const publication = new AdminQuestionnaireRevisionService(
    prisma,
    questionnaire,
  );
  const owners = [
    new AdminDashboardService(prisma),
    new AdminUserReadService(prisma),
    new AdminUserWriteService(prisma, audit, snapshots),
    new AdminCycleReadService(prisma),
    new AdminCycleManagementService(
      prisma,
      cycles,
      cycles as unknown as CycleMatchingService,
      audit,
      weekly,
    ),
    new AdminReportReadService(prisma, audit),
    new AdminReportReviewService(prisma, snapshots),
    new AdminQuestionnaireService(prisma, audit, questionnaire, publication),
    new AdminTestDataService(prisma, audit, snapshots),
  ];
  const bindings = new WeakMap<object, unknown>();
  const ownerFor = (key: string | symbol) =>
    owners.find((owner) => key in owner);
  function read(key: string | symbol) {
    const owner = ownerFor(key);
    if (!owner) return undefined;
    const value: unknown = Reflect.get(owner, key);
    if (typeof value !== 'function' || '_isMockFunction' in value) return value;
    if (!bindings.has(value)) bindings.set(value, value.bind(owner));
    return bindings.get(value);
  }
  return new Proxy(owners[0], {
    get: (_, key) => read(key),
    set: (_, key, value) => Reflect.set(ownerFor(key) ?? owners[0], key, value),
    getOwnPropertyDescriptor: (_, key) => ({
      configurable: true,
      enumerable: true,
      writable: true,
      value: read(key),
    }),
  }) as unknown as AdminTestHarness;
}
