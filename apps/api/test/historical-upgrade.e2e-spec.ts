import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';

// This owns the complete upgrade path. The smaller migration suites retain
// exceptional data boundaries and rerun semantics that this journey cannot replace.
it('upgrades an old schema through every pending migration without losing private history, coupons or sent mail', async () => {
  const target = new URL(process.env.DATABASE_URL!);
  if (
    target.protocol !== 'postgresql:' ||
    target.search ||
    target.hash ||
    target.hostname !== '127.0.0.1' ||
    !target.port ||
    target.port === '5432' ||
    target.username !== 'e2e' ||
    !/^\/lilink_vip_test_[a-f0-9]+$/.test(target.pathname)
  ) {
    throw new Error('Historical upgrades require the disposable API runner.');
  }
  const database = `${target.pathname.slice(1)}${randomBytes(4).toString('hex')}`;
  const admin = new Client({ connectionString: target.href });
  await admin.connect();
  const owner = await admin.query<Record<string, unknown>>(
    'SELECT current_user AS owner',
  );
  expect(owner.rows[0].owner).toBe('e2e');
  const apiRoot = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(apiRoot, '../..');
  const output = process.env.E2E_OUTPUT ?? path.join(repoRoot, 'artifacts');
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, 'upgrade-'));
  const migrationPath = path.join(temporary, 'migrations');
  const configPath = path.join(temporary, 'prisma.config.ts');
  await mkdir(migrationPath);
  await writeFile(
    configPath,
    `import config from ${JSON.stringify(path.join(apiRoot, 'prisma.config.ts'))};
export default { ...config, schema: ${JSON.stringify(path.join(apiRoot, 'prisma/schema.prisma'))}, migrations: { ...config.migrations, path: ${JSON.stringify(migrationPath)} } };\n`,
  );
  const migrations = (await readdir(path.join(apiRoot, 'prisma/migrations')))
    .filter((name) => /^\d{14}_/.test(name))
    .sort();
  target.pathname = `/${database}`;
  const env = { ...process.env, DATABASE_URL: target.href };
  const deploy = async (config = configPath) => {
    const result = await promisify(execFile)(
      process.execPath,
      [
        path.join(repoRoot, 'node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
        '--config',
        config,
      ],
      {
        cwd: apiRoot,
        env,
        timeout: 60_000,
        maxBuffer: 2_000_000,
      },
    );
    return result.stdout;
  };
  const stage = async (through: string) => {
    for (const name of migrations.filter((name) => name <= through))
      await cp(
        path.join(apiRoot, 'prisma/migrations', name),
        path.join(migrationPath, name),
        { recursive: true },
      );
    await cp(
      path.join(apiRoot, 'prisma/migrations/migration_lock.toml'),
      path.join(migrationPath, 'migration_lock.toml'),
    );
    await deploy();
  };
  let db: Client | undefined;
  let created = false;
  try {
    await admin.query<Record<string, unknown>>(
      `CREATE DATABASE "${database}" OWNER e2e`,
    );
    created = true;
    await stage('20260913000000_contact_preferences_revision');
    db = new Client({ connectionString: target.href });
    await db.connect();
    const oldAnswers = {
      hard_gender: '女',
      hard_partner_genders: ['男'],
      hard_one_liner_intro: 'Preserved introduction',
      hard_height_cm: 175,
      retired: ['exact', null],
    };
    const oldDraft = {
      hardMatchForm: { gender: '女', oneLinerIntro: 'Draft introduction' },
      nested: { exact: true },
    };
    await db.query<Record<string, unknown>>(`
      INSERT INTO "School" (id,name,slug,"updatedAt") VALUES ('school','Synthetic university','synthetic-university',NOW());
      INSERT INTO "QuestionnaireVersion" (id,title,"isCurrent","updatedAt") VALUES ('version','Historical',true,NOW());
      INSERT INTO "Question" (id,"versionId",key,prompt,type,"order") VALUES ('question','version','legacy','Legacy','SINGLE_SELECT',1);
      INSERT INTO "MatchCycle" (id,codename,"participationDeadline","revealAt",status,"updatedAt") VALUES
        ('revealed','Historical reveal','2020-01-01','2020-01-02','REVEALED',NOW()),
        ('open','Legacy signup','2020-01-01','2090-01-02','OPEN','2020-01-01');
    `);
    const choiceKeys = [
      'values',
      'red_flag_sensitivity',
      'shared_growth_topics',
      'feeling_cared_for',
    ];
    for (const [index, key] of choiceKeys.entries()) {
      await db.query(
        `INSERT INTO "Question" (id,"versionId",key,prompt,type,"order","selectionLimit",options) VALUES ($1,'version',$1,'Historical four choices','MULTI_SELECT',$2,4,'[]')`,
        [key, index + 2],
      );
    }
    for (const id of ['left', 'right', 'edited']) {
      await db.query<Record<string, unknown>>(
        `INSERT INTO "User" (id,email,"passwordHash",status,"schoolId","displayName","preferredContactChannel","updatedAt")
        VALUES ($1,$2,'preserved-password-hash','ACTIVE','school','Preserved name','WECHAT',NOW())`,
        [id, `${id}@synthetic.invalid`],
      );
      await db.query<Record<string, unknown>>(
        `INSERT INTO "UserContactMethod" (id,"userId",type,value,"updatedAt") VALUES ($1,$2,'WECHAT',$3,NOW())`,
        [`contact-${id}`, id, `synthetic-${id}`],
      );
      await db.query<Record<string, unknown>>(
        `INSERT INTO "QuestionnaireResponse" (id,"userId","versionId",answers,"draftAnswers","acknowledgedQuestionnaireVersionId","acknowledgedQuestionnaireKeys","acknowledgedHardMatchSignatures","submittedAt","updatedAt")
        VALUES ($1,$2,'version',$3,$4,'version','["legacy"]','{"opaque":"preserved"}','2020-01-01','2020-01-01')`,
        [`response-${id}`, id, oldAnswers, oldDraft],
      );
      for (const cycle of ['revealed', 'open'])
        await db.query<Record<string, unknown>>(
          `INSERT INTO "CycleParticipation" (id,"cycleId","userId",status,intent,"optedInAt","updatedAt") VALUES ($1,$2,$3,'OPTED_IN','BOTH','2020-01-01','2020-01-01')`,
          [`${id}-${cycle}`, cycle, id],
        );
    }
    await db.query<
      Record<string, unknown>
    >(`INSERT INTO "Match" (id,"cycleId",score,"revealedAt","updatedAt") VALUES ('match','revealed',85,'2020-01-02','2020-01-02');
      INSERT INTO "MatchParticipant" (id,"matchId","cycleId","userId",position) VALUES ('left-match','match','revealed','left',0),('right-match','match','revealed','right',1);
      INSERT INTO "Campaign" (id,name,slug,status,"updatedAt") VALUES ('campaign','Historical reward','historical-reward','ENDED',NOW());
      INSERT INTO "Merchant" (id,name,"updatedAt") VALUES ('merchant','Synthetic merchant',NOW());
      INSERT INTO "CouponTemplate" (id,"campaignId","merchantId",title,"benefitType","faceValue","updatedAt") VALUES ('template','campaign','merchant','Historical coupon','CUSTOM',100,NOW());
      INSERT INTO "Coupon" (id,"templateId","userId",code,status,"updatedAt") VALUES ('coupon','template','left','synthetic-coupon','REDEEMED',NOW());
      INSERT INTO "CampaignActivation" (id,"userId","campaignId","couponsGrantedAt") VALUES ('activation','left','campaign','2020-01-01');
    `);
    for (const status of ['PENDING', 'FAILED', 'PROCESSING', 'SENT']) {
      await db.query<Record<string, unknown>>(
        `INSERT INTO "OutboundEmail" (id,"dedupeKey","recipientEmail",subject,html,status,"nextAttemptAt","sentAt","updatedAt")
        VALUES ($1,$2,'left@synthetic.invalid','Historical','Synthetic',$3,NOW(),$4,NOW())`,
        [
          `mail-${status}`,
          `meetup-reminder:${status}`,
          status,
          status === 'SENT' ? new Date('2020-01-01') : null,
        ],
      );
      await db.query<Record<string, unknown>>(
        `INSERT INTO "ProductEventOutbox" (id,"eventId",name,status,"nextAttemptAt","updatedAt") VALUES ($1,$1,'meetup_created',$2,NOW(),NOW())`,
        [`event-${status}`, status === 'SENT' ? 'RECORDED' : status],
      );
      if (status !== 'SENT')
        await db.query<Record<string, unknown>>(
          `INSERT INTO "ProductEventOutbox" (id,"eventId",name,status,"nextAttemptAt","updatedAt") VALUES ($1,$1,'match_contact_requested',$2,NOW(),NOW())`,
          [`contact-${status}`, status],
        );
    }
    await db.query(`INSERT INTO "OutboundEmail" (id,"dedupeKey","recipientEmail",subject,html,"updatedAt") VALUES ('current-mail','match-reveal:current','left@synthetic.invalid','Current','Synthetic',NOW());
      INSERT INTO "ProductEventOutbox" (id,"eventId",name,"updatedAt") VALUES ('current-event','current-event','coupon_redeemed',NOW());`);
    const unchangedMail = (
      await db.query<Record<string, unknown>>(
        `SELECT * FROM "OutboundEmail" WHERE id IN ('current-mail','mail-SENT') ORDER BY id`,
      )
    ).rows;
    const unchangedEvents = (
      await db.query<Record<string, unknown>>(
        `SELECT * FROM "ProductEventOutbox" WHERE id IN ('current-event','event-SENT') ORDER BY id`,
      )
    ).rows;
    const before = (
      await db.query<Record<string, unknown>>(
        'SELECT * FROM "QuestionnaireResponse" ORDER BY id',
      )
    ).rows;
    await stage('20260920200000_archive_and_reset_questionnaires');
    await db.query<Record<string, unknown>>(
      `UPDATE "QuestionnaireResponse" SET answers='{"hard_gender":"男","hard_one_liner_intro":"New edited introduction"}', "updatedAt"=NOW() WHERE "userId"='edited'`,
    );
    await stage('20260921110000_reuse_archived_profile_basics');
    // The choice-limit migration must change only current definitions, preserving
    // submitted user data byte-for-byte and leaving archived definitions alone.
    await db.query(
      `UPDATE "QuestionnaireResponse" SET answers=$1,"submittedAt"='2026-09-21',"updatedAt"='2026-09-21' WHERE "userId"='right'`,
      [
        Object.fromEntries(
          choiceKeys.map((key) => [key, ['a', 'b', 'c', 'd']]),
        ),
      ],
    );
    const beforeChoice = (
      await db.query<Record<string, unknown>>(
        'SELECT * FROM "QuestionnaireResponse" ORDER BY id',
      )
    ).rows;
    const historicalChoices = (
      await db.query<Record<string, unknown>>(
        `SELECT * FROM "Question" WHERE "versionId"='version' AND key=ANY($1::text[]) ORDER BY key`,
        [choiceKeys],
      )
    ).rows;
    expect(historicalChoices).toHaveLength(4);
    expect(
      historicalChoices.every((question) => question.selectionLimit === 4),
    ).toBe(true);
    await deploy(path.join(apiRoot, 'prisma.config.ts'));
    expect(
      (
        await db.query<Record<string, unknown>>(
          'SELECT * FROM "QuestionnaireResponse" ORDER BY id',
        )
      ).rows,
    ).toEqual(beforeChoice);
    expect(
      (
        await db.query<Record<string, unknown>>(
          `SELECT * FROM "Question" WHERE "versionId"='version' AND key=ANY($1::text[]) ORDER BY key`,
          [choiceKeys],
        )
      ).rows,
    ).toEqual(historicalChoices);
    const currentChoices = (
      await db.query<Record<string, unknown>>(
        `SELECT q.key,q."selectionLimit" FROM "Question" q JOIN "QuestionnaireVersion" v ON v.id=q."versionId" WHERE v."isCurrent" AND q.key=ANY($1::text[]) ORDER BY q.key`,
        [choiceKeys],
      )
    ).rows;
    expect(currentChoices).toEqual(
      [...choiceKeys].sort().map((key) => ({ key, selectionLimit: 3 })),
    );
    const archives = (
      await db.query<Record<string, unknown>>(
        'SELECT * FROM "QuestionnaireResponseArchive" ORDER BY "sourceResponseId"',
      )
    ).rows;
    expect(archives).toHaveLength(3);
    for (const old of before) {
      const archive = archives.find((row) => row.sourceResponseId === old.id);
      if (!archive) throw new Error('Missing historical archive');
      for (const key of [
        'userId',
        'versionId',
        'answers',
        'draftAnswers',
        'acknowledgedQuestionnaireVersionId',
        'acknowledgedQuestionnaireKeys',
        'acknowledgedHardMatchSignatures',
        'submittedAt',
      ])
        expect(archive[key]).toEqual(old[key]);
      expect(archive.sourceUpdatedAt).toEqual(old.updatedAt);
    }
    const users = (
      await db.query<Record<string, unknown>>(
        'SELECT "passwordHash","displayName",status FROM "User"',
      )
    ).rows;
    expect(users).toHaveLength(3);
    expect(
      users.every(
        (user) =>
          user.passwordHash === 'preserved-password-hash' &&
          user.displayName === 'Preserved name' &&
          user.status === 'ACTIVE',
      ),
    ).toBe(true);
    const responses = (
      await db.query<Record<string, unknown>>(
        'SELECT "userId",answers,"draftAnswers","submittedAt" FROM "QuestionnaireResponse" ORDER BY "userId"',
      )
    ).rows;
    expect(responses.find((row) => row.userId === 'left')).toEqual({
      userId: 'left',
      answers: {
        hard_gender: '女',
        hard_one_liner_intro: 'Draft introduction',
      },
      draftAnswers: null,
      submittedAt: null,
    });
    expect(responses.find((row) => row.userId === 'edited')).toMatchObject({
      answers: {
        hard_gender: '男',
        hard_one_liner_intro: 'New edited introduction',
      },
    });
    const participants = (
      await db.query<Record<string, unknown>>(
        'SELECT "userId","introducedContactType","introducedContactValue","profileSnapshot" FROM "MatchParticipant"',
      )
    ).rows;
    expect(participants).toHaveLength(2);
    for (const participant of participants) {
      expect(participant).toMatchObject({
        introducedContactType: 'WECHAT',
        introducedContactValue: `synthetic-${String(participant.userId)}`,
        profileSnapshot: {
          source: 'pre-reset-visible-profile',
          introLine: 'Preserved introduction',
          gender: '女',
          partnerGenders: ['男'],
        },
      });
    }
    expect(
      (
        await db.query<Record<string, unknown>>(
          'SELECT "introducedAt" FROM "Match"',
        )
      ).rows[0].introducedAt,
    ).not.toBeNull();
    expect(
      (
        await db.query<Record<string, unknown>>(
          'SELECT status,intent FROM "CycleParticipation" WHERE "cycleId"=\'revealed\'',
        )
      ).rows.every((row) => row.status === 'OPTED_IN' && row.intent === 'BOTH'),
    ).toBe(true);
    expect(
      (
        await db.query<Record<string, unknown>>(
          'SELECT status,intent FROM "CycleParticipation" WHERE "cycleId"=\'open\'',
        )
      ).rows.every((row) => row.status === 'OPTED_OUT' && row.intent === null),
    ).toBe(true);
    expect(
      (
        await db.query<Record<string, unknown>>(
          'SELECT "userId",status FROM "Coupon"',
        )
      ).rows,
    ).toEqual([{ userId: 'left', status: 'REDEEMED' }]);
    expect(
      (
        await db.query<Record<string, unknown>>(
          'SELECT "userId" FROM "CampaignActivation"',
        )
      ).rows,
    ).toEqual([{ userId: 'left' }]);
    const mails = (
      await db.query<Record<string, unknown>>(
        'SELECT id,status,"sentAt","nextAttemptAt" FROM "OutboundEmail" ORDER BY id',
      )
    ).rows;
    expect(mails).toHaveLength(5);
    expect(
      (
        await db.query<Record<string, unknown>>(
          `SELECT * FROM "OutboundEmail" WHERE id IN ('current-mail','mail-SENT') ORDER BY id`,
        )
      ).rows,
    ).toEqual(unchangedMail);
    expect(
      (
        await db.query<Record<string, unknown>>(
          `SELECT * FROM "ProductEventOutbox" WHERE id IN ('current-event','event-SENT') ORDER BY id`,
        )
      ).rows,
    ).toEqual(unchangedEvents);
    expect(mails.find((row) => row.id === 'mail-SENT')).toMatchObject({
      status: 'SENT',
      sentAt: new Date('2020-01-01'),
    });
    expect(
      mails
        .filter((row) => row.id !== 'mail-SENT' && row.id !== 'current-mail')
        .every(
          (row) => row.status === 'EXHAUSTED' && row.nextAttemptAt === null,
        ),
    ).toBe(true);
    const events = (
      await db.query<Record<string, unknown>>(
        'SELECT status FROM "ProductEventOutbox"',
      )
    ).rows
      .map((row) => row.status)
      .sort();
    expect(events).toEqual([
      ...Array<string>(6).fill('EXHAUSTED'),
      'PENDING',
      'RECORDED',
    ]);
    expect(
      (
        await db.query<Record<string, unknown>>(
          `SELECT COUNT(*)::int AS count FROM "ProductEventOutbox" WHERE status='EXHAUSTED' AND "nextAttemptAt" IS NULL`,
        )
      ).rows[0].count,
    ).toBe(6);
    expect(
      (
        await db.query<Record<string, unknown>>(
          'SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
        )
      ).rows[0].count,
    ).toBe(migrations.length);
    expect(await deploy(path.join(apiRoot, 'prisma.config.ts'))).toContain(
      'No pending migrations',
    );
    expect(
      (
        await db.query<Record<string, unknown>>(
          'SELECT * FROM "QuestionnaireResponseArchive" ORDER BY "sourceResponseId"',
        )
      ).rows,
    ).toEqual(archives);
    await writeFile(
      path.join(output, 'historical-upgrade.json'),
      JSON.stringify(
        {
          migrations: migrations.length,
          sourceSchema: '20260913000000_contact_preferences_revision',
          syntheticUsers: 3,
          historyPreserved: true,
          editedProfilePreserved: true,
          currentChoiceLimitsChangedWithoutAlteringHistoricalData: true,
          retiredMailDisabled: true,
          pendingAfterUpgrade: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await db?.end();
    if (created)
      await admin.query<Record<string, unknown>>(
        `DROP DATABASE "${database}" WITH (FORCE)`,
      );
    await admin.end();
    await rm(temporary, { recursive: true, force: true });
  }
}, 120_000);
