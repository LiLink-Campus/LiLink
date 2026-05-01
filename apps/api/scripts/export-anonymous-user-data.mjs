import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { loadMonorepoEnv } from "./load-env.mjs";

const require = createRequire(import.meta.url);
const { HARD_MATCH_KEYS } = require("@lilink/shared");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const inferredRepoRoot = path.resolve(apiRoot, "..", "..");

if (!process.env.DATABASE_URL) {
  loadMonorepoEnv();
}

const prisma = new PrismaClient();

const HARD_MATCH_KEY_SET = new Set(Object.values(HARD_MATCH_KEYS));

function isPartnerPreferenceHardMatchKey(key) {
  return (
    key.startsWith("hard_partner_") ||
    key === HARD_MATCH_KEYS.excludedPartnerSchools ||
    key === HARD_MATCH_KEYS.excludedPartnerSchoolGenders
  );
}

const HARD_MATCH_OMIT_KEYS = new Set([
  HARD_MATCH_KEYS.oneLinerIntro,
  HARD_MATCH_KEYS.birthDate,
]);

function readArg(prefix) {
  const match = process.argv.find((value) => value.startsWith(prefix));
  if (!match) {
    return null;
  }
  const rawValue = match.slice(prefix.length).trim();
  return rawValue.length > 0 ? rawValue : null;
}

function anonymousSubjectKey(userId) {
  return createHash("sha256").update(userId, "utf8").digest("hex").slice(0, 24);
}

function asObjectRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function partitionQuestionnaireAnswers(raw) {
  const answers = asObjectRecord(raw);
  const hardMatchSelf = {};
  const partnerPreferences = {};
  const values = {};

  for (const [key, val] of Object.entries(answers)) {
    if (!HARD_MATCH_KEY_SET.has(key)) {
      values[key] = val;
      continue;
    }
    if (isPartnerPreferenceHardMatchKey(key)) {
      partnerPreferences[key] = val;
      continue;
    }
    if (HARD_MATCH_OMIT_KEYS.has(key)) {
      continue;
    }
    hardMatchSelf[key] = val;
  }

  return { hardMatchSelf, partnerPreferences, values };
}

function defaultOutputDirectory() {
  if (existsSync(path.join(inferredRepoRoot, "docker-compose.yml"))) {
    return inferredRepoRoot;
  }
  return tmpdir();
}

function printHelp() {
  console.log(`Export anonymous user rows (no credentials or direct identifiers).

Usage:
  node scripts/export-anonymous-user-data.mjs [options]

  --out=<file>      Write JSON to this path (default: repo root or OS temp)
  --stdout          Print JSON to stdout (use with shell redirect to host path; recommended in Docker)
  --omit-test-users Only include users where isTest is false
  -h, --help        This message

Docker (from host, run in repo checkout directory):
  docker exec lilink-api node scripts/export-anonymous-user-data.mjs --stdout \\
    > anonymous-user-export.json
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const toStdout = process.argv.includes("--stdout");
  const omitTestUsers = process.argv.includes("--omit-test-users");
  const outArg = readArg("--out=");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultName = `anonymous-user-export-${ts}.json`;
  const defaultDir = defaultOutputDirectory();
  const fallbackFilePath = path.join(defaultDir, defaultName);

  if (toStdout && outArg) {
    throw new Error("Use either --stdout or --out=..., not both.");
  }

  const users = await prisma.user.findMany({
    where: omitTestUsers ? { isTest: false } : undefined,
    select: {
      id: true,
      status: true,
      isTest: true,
      createdAt: true,
      school: { select: { slug: true } },
      profile: {
        select: {
          schoolYear: true,
          programName: true,
          pronouns: true,
          genderIdentity: true,
          ageMin: true,
          ageMax: true,
          languages: true,
          interests: true,
          interestedIn: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      questionnaireResponse: {
        select: {
          versionId: true,
          submittedAt: true,
          updatedAt: true,
          answers: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const exportRows = users.map((user) => {
    const q = user.questionnaireResponse;
    const partitioned = q
      ? partitionQuestionnaireAnswers(q.answers)
      : {
          hardMatchSelf: {},
          partnerPreferences: {},
          values: {},
        };

    return {
      anonymousSubjectKey: anonymousSubjectKey(user.id),
      user: {
        status: user.status,
        isTest: user.isTest,
        accountCreatedAt: user.createdAt.toISOString(),
        schoolSlug: user.school?.slug ?? null,
      },
      profileBasics: user.profile
        ? {
            schoolYear: user.profile.schoolYear,
            programName: user.profile.programName,
            pronouns: user.profile.pronouns,
            genderIdentity: user.profile.genderIdentity,
            preferredPartnerAgeMin: user.profile.ageMin,
            preferredPartnerAgeMax: user.profile.ageMax,
            languages: user.profile.languages,
            interests: user.profile.interests,
            interestedIn: user.profile.interestedIn,
            profileCreatedAt: user.profile.createdAt.toISOString(),
            profileUpdatedAt: user.profile.updatedAt.toISOString(),
          }
        : null,
      questionnaire: q
        ? {
            versionId: q.versionId,
            submittedAt: q.submittedAt?.toISOString() ?? null,
            updatedAt: q.updatedAt.toISOString(),
            hardMatchSelf: partitioned.hardMatchSelf,
            partnerPreferencesFromQuestionnaire: partitioned.partnerPreferences,
            valuesQuestionnaireAnswers: partitioned.values,
          }
        : null,
    };
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    omitTestUsers,
    rowCount: exportRows.length,
    description:
      "Anonymous export: no email, password, display name, or profile text fields. user.id is replaced by anonymousSubjectKey (sha256 truncated).",
    rows: exportRows,
  };

  const body = `${JSON.stringify(payload, null, 2)}\n`;

  if (toStdout) {
    process.stdout.write(body);
    console.error(`[export-anonymous-user-data] ${exportRows.length} rows -> stdout`);
    return;
  }

  const outPath = outArg ?? fallbackFilePath;
  await writeFile(outPath, body, "utf8");
  console.log(`Wrote ${exportRows.length} rows to ${outPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
