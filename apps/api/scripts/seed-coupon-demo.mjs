import { loadMonorepoEnv } from './load-env.mjs';
import { loadPrismaClientModule } from './prisma-client.mjs';
import {
  COUPON_CODE_LENGTH,
  generateHumanCode,
  generateTotpSecret,
} from '@lilink/shared';

loadMonorepoEnv();

const PRODUCTION_ENVIRONMENT_NAMES = new Set(['prod', 'production']);
const SAFE_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SAFE_DATABASE_TARGET_MARKER_PATTERN =
  /(^|[-_.])(?:dev|development|test|testing|demo|local)(?:[-_.]|$)/i;

const CAMPAIGN_SLUG = 'local-coupon-preview';
const COUPON_CODE_GENERATION_MAX_ATTEMPTS = 12;

const SOCIAL_RULE = {
  version: 1,
  tiers: [
    { minSpend: 3000, benefit: { type: 'AMOUNT_OFF', amountOff: 500 } },
    { minSpend: 5000, benefit: { type: 'AMOUNT_OFF', amountOff: 1200 } },
    { minSpend: 10000, benefit: { type: 'AMOUNT_OFF', amountOff: 3000 } },
  ],
};

const VIBES_RULE = {
  version: 1,
  tiers: [
    { minSpend: 5000, benefit: { type: 'GIFT', description: '一杯气泡饮料' } },
    {
      minSpend: 10000,
      benefit: { type: 'GIFT', description: '一杯软饮料/半份小食拼盘' },
    },
    { minSpend: 20000, benefit: { type: 'GIFT', description: '两杯任意饮料' } },
  ],
};

const DEMO_TEMPLATES = [
  {
    merchantName: 'Social',
    title: 'Social优惠券',
    benefitType: 'FULL_REDUCTION',
    faceValue: 3000,
    rule: SOCIAL_RULE,
  },
  {
    merchantName: 'Vibes',
    title: 'Vibes优惠券',
    benefitType: 'GIFT',
    faceValue: 0,
    rule: VIBES_RULE,
  },
];

let prisma;

function readArgument(name) {
  const prefixed = `--${name}=`;
  const direct = process.argv.find((value) => value.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);

  const index = process.argv.findIndex((value) => value === `--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function readBooleanArgument(name) {
  return process.argv.includes(`--${name}`);
}

function isProductionLikeEnvironment() {
  return [process.env.APP_ENV, process.env.NODE_ENV]
    .map((value) => value?.trim().toLowerCase())
    .some((value) => value && PRODUCTION_ENVIRONMENT_NAMES.has(value));
}

function hasSafeDatabaseTargetMarker(value) {
  return SAFE_DATABASE_TARGET_MARKER_PATTERN.test(value);
}

function readDatabaseTarget() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      'Refusing to seed coupon demo data because DATABASE_URL is not set.',
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error(
      'Refusing to seed coupon demo data because DATABASE_URL is not a valid URL.',
    );
  }

  const hostname = parsedUrl.hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  const databaseName = decodeURIComponent(
    parsedUrl.pathname.replace(/^\/+/, '').split('/')[0] ?? '',
  );

  return { hostname, databaseName };
}

function isSafeDatabaseTarget(databaseTarget) {
  return (
    SAFE_DATABASE_HOSTS.has(databaseTarget.hostname) ||
    hasSafeDatabaseTargetMarker(databaseTarget.hostname) ||
    hasSafeDatabaseTargetMarker(databaseTarget.databaseName)
  );
}

function assertSafeRuntime() {
  const allowProductionSeed =
    readBooleanArgument('allow-production-demo-seed') ||
    process.env.COUPON_DEMO_ALLOW_PRODUCTION === '1';

  if (allowProductionSeed) return;

  if (isProductionLikeEnvironment()) {
    throw new Error(
      'Refusing to seed coupon demo data in production. Set COUPON_DEMO_ALLOW_PRODUCTION=1 or pass --allow-production-demo-seed only for an intentional demo-data operation.',
    );
  }

  const databaseTarget = readDatabaseTarget();
  if (isSafeDatabaseTarget(databaseTarget)) return;

  throw new Error(
    `Refusing to seed coupon demo data into database host "${databaseTarget.hostname || 'unknown'}" and database "${databaseTarget.databaseName || 'unknown'}". Use a local/dev/test/demo database, or set COUPON_DEMO_ALLOW_PRODUCTION=1 or pass --allow-production-demo-seed only for an intentional demo-data operation.`,
  );
}

async function resolveTargetUsers(emailArg, grantAll) {
  if (grantAll) {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, displayName: true, status: true },
    });
    if (users.length === 0) {
      throw new Error('No ACTIVE users found.');
    }
    return users;
  }

  return [await resolveTargetUser(emailArg)];
}

async function issueCouponsForUser(user, templatesByMerchant) {
  let issued = 0;
  let skipped = 0;

  for (const { merchant, savedTemplate } of templatesByMerchant) {
    const result = await createCouponWithUniqueCode(user.id, savedTemplate.id);

    if (result.created) {
      issued += 1;
      console.log(
        `[seed-coupon-demo] Issued ${savedTemplate.title} (${merchant.name}) -> ${user.displayName ?? user.email}`,
      );
    } else if (result.coupon?.status === 'ISSUED') {
      skipped += 1;
      console.log(
        `[seed-coupon-demo] Already issued ${savedTemplate.title} (${merchant.name}) -> ${user.displayName ?? user.email}`,
      );
    } else {
      skipped += 1;
      console.log(
        `[seed-coupon-demo] Skipped ${savedTemplate.title} -> ${user.displayName ?? user.email}: existing coupon is ${result.coupon?.status ?? 'missing'}`,
      );
    }
  }

  return { issued, skipped };
}

async function resolveTargetUser(emailArg) {
  if (emailArg) {
    const user = await prisma.user.findUnique({
      where: { email: emailArg.trim().toLowerCase() },
      select: { id: true, email: true, displayName: true, status: true },
    });
    if (!user) {
      throw new Error(`No user found for email "${emailArg}".`);
    }
    if (user.status !== 'ACTIVE') {
      throw new Error(`User "${emailArg}" is not ACTIVE.`);
    }
    return user;
  }

  const user = await prisma.user.findFirst({
    where: { status: 'ACTIVE', isTest: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, displayName: true, status: true },
  });

  if (user) return user;

  const fallback = await prisma.user.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, displayName: true, status: true },
  });

  if (!fallback) {
    throw new Error(
      'No ACTIVE user found. Pass --email=<your-login-email> after registering locally.',
    );
  }

  return fallback;
}

async function upsertMerchant(name) {
  const existing = await prisma.merchant.findFirst({
    where: { name },
    select: { id: true, name: true },
  });
  if (existing) return existing;

  return prisma.merchant.create({
    data: { name, isActive: true },
    select: { id: true, name: true },
  });
}

async function upsertCampaign() {
  return prisma.campaign.upsert({
    where: { slug: CAMPAIGN_SLUG },
    create: {
      name: 'Local coupon preview',
      slug: CAMPAIGN_SLUG,
      status: 'ACTIVE',
      isDefault: false,
      description: 'Local-only preview coupons for UI testing.',
    },
    update: {
      status: 'ACTIVE',
      description: 'Local-only preview coupons for UI testing.',
    },
    select: { id: true, slug: true },
  });
}

async function upsertTemplate(campaignId, merchantId, template) {
  const existing = await prisma.couponTemplate.findFirst({
    where: {
      campaignId,
      merchantId,
      title: template.title,
    },
    select: { id: true, title: true },
  });

  if (existing) {
    await prisma.couponTemplate.update({
      where: { id: existing.id },
      data: {
        benefitType: template.benefitType,
        faceValue: template.faceValue,
        rule: template.rule,
        isActive: true,
      },
    });
    return existing;
  }

  return prisma.couponTemplate.create({
    data: {
      campaignId,
      merchantId,
      title: template.title,
      benefitType: template.benefitType,
      faceValue: template.faceValue,
      rule: template.rule,
      isActive: true,
    },
    select: { id: true, title: true },
  });
}

async function createCouponWithUniqueCode(userId, templateId) {
  const existing = await prisma.coupon.findUnique({
    where: { userId_templateId: { userId, templateId } },
    select: { id: true, code: true, status: true },
  });
  if (existing) {
    return { created: false, coupon: existing };
  }

  for (let attempt = 0; attempt < COUPON_CODE_GENERATION_MAX_ATTEMPTS; attempt += 1) {
    const code = generateHumanCode({ length: COUPON_CODE_LENGTH });
    const totpSecret = generateTotpSecret();
    try {
      const coupon = await prisma.coupon.create({
        data: {
          userId,
          templateId,
          code,
          totpSecret,
          status: 'ISSUED',
          expiresAt: null,
        },
        select: { id: true, code: true, status: true },
      });
      return { created: true, coupon };
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
      const raced = await prisma.coupon.findUnique({
        where: { userId_templateId: { userId, templateId } },
        select: { id: true, code: true, status: true },
      });
      if (raced) {
        return { created: false, coupon: raced };
      }
    }
  }

  throw new Error('Failed to generate a unique coupon code.');
}

async function main() {
  assertSafeRuntime();

  const emailArg = readArgument('email');
  const grantAll = readBooleanArgument('all');
  const { createPrismaClient } = await loadPrismaClientModule();
  prisma = createPrismaClient();

  if (grantAll && emailArg) {
    throw new Error('Use either --all or --email, not both.');
  }

  const users = await resolveTargetUsers(emailArg, grantAll);
  const campaign = await upsertCampaign();

  console.log(
    `[seed-coupon-demo] Target users: ${users.length}${grantAll ? ' (all ACTIVE)' : ''}`,
  );
  console.log(`[seed-coupon-demo] Campaign: ${campaign.slug}`);

  const templatesByMerchant = [];
  for (const template of DEMO_TEMPLATES) {
    const merchant = await upsertMerchant(template.merchantName);
    const savedTemplate = await upsertTemplate(
      campaign.id,
      merchant.id,
      template,
    );
    templatesByMerchant.push({ merchant, savedTemplate });
  }

  let totalIssued = 0;
  let totalSkipped = 0;
  for (const user of users) {
    const { issued, skipped } = await issueCouponsForUser(user, templatesByMerchant);
    totalIssued += issued;
    totalSkipped += skipped;
  }

  console.log(
    `[seed-coupon-demo] Done. Issued ${totalIssued}, skipped ${totalSkipped}. Open /dashboard/coupons to preview.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
