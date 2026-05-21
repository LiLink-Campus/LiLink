import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

function readRepoFile(path) {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function indexOfOrThrow(source, needle, label = needle) {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, `missing ${label}`);
  return index;
}

test("force-run script only auto-selects cycles whose time gate has passed", () => {
  const source = readRepoFile("apps/api/scripts/force-run-current-cycle.mjs");

  assert.match(source, /participationDeadline/);
  assert.match(source, /revealAt/);
  assert.match(source, /isRunnableCycle/);
  assert.doesNotMatch(
    source,
    /const order = \["REVEAL_READY", "PREPARING", "OPEN"\];[\s\S]*?items\.find\(\(c\) => c\.status === status\)/,
  );
});

test("dashboard focus keeps locked cycles and missing intent ahead of stale tasks", () => {
  const source = readRepoFile("apps/web/src/app/dashboard/_lib/focus.ts");

  assert.match(source, /canEdit && \(!isOptedIn \|\| !intent\)/);
  assert.match(source, /cycle && canEdit && isOptedIn && intent/);

  const lockedIndex = indexOfOrThrow(
    source,
    "// 9: current cycle exists",
    "locked cycle branch",
  );
  const lastRoundIndex = indexOfOrThrow(
    source,
    "// 10: last round",
    "last-round branch",
  );
  assert.ok(
    lockedIndex < lastRoundIndex,
    "locked current cycles must not be hidden by last-round unmatched state",
  );
});

test("match page hides identity before introduction and keeps safety/report actions available", () => {
  const source = readRepoFile("apps/web/src/app/dashboard/match/match-client.tsx");

  assert.match(source, /const initial = introduced \? avatarInitialFor\(counterpart\.displayName\) : "TA"/);
  assert.match(source, /avatarInitial=\{initial\}/);
  assert.doesNotMatch(source, /: counterpart\.schoolName \?\? "等你决定如何破冰"/);
  assert.match(source, /\{introduced && counterpart\?\.introLine \?/);
  assert.match(source, /if \(introduced\) \{[\s\S]*?router\.push/);
  assert.match(source, /gender=\{counterpart\.gender\}/);
  assert.doesNotMatch(
    source,
    /\{introduced && latestMatch && !reportHandlingChipLabel\(latestMatch\.reportStatus\) \?/,
  );
});

test("profile and card editors expose and validate required public card fields", () => {
  const profile = readRepoFile("apps/web/src/app/dashboard/profile/profile-client.tsx");
  const card = readRepoFile("apps/web/src/app/dashboard/me/card/card-client.tsx");
  const me = readRepoFile("apps/web/src/app/dashboard/me/me-client.tsx");

  assert.match(profile, /name="oneLinerIntro"/);
  assert.match(profile, /HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH/);

  const contactSave = indexOfOrThrow(card, 'fetchApi("/me/contact-preferences"');
  const displayNameValidation = indexOfOrThrow(card, "trimmedDisplayName.length < 2");
  assert.ok(
    displayNameValidation < contactSave,
    "card editor must validate display name before saving contact preferences",
  );

  assert.match(me, /hardMatchFormFromAnswers/);
  assert.doesNotMatch(me, /draft\?\.hardMatchForm\?\.oneLinerIntro/);
});

test("meetup proposal flow uses CST wall-clock values and recoverable candidate errors", () => {
  const meetup = readRepoFile(
    "apps/web/src/app/dashboard/meetup/_components/MeetupClient.tsx",
  );
  const bottomBar = readRepoFile(
    "apps/web/src/app/dashboard/meetup/_components/MeetupBottomBar.tsx",
  );
  const cst = readRepoFile("apps/web/src/lib/china-standard-time.ts");

  assert.match(meetup, /meetupSlotDatetimeLocalValue/);
  assert.doesNotMatch(meetup, /setHours\(slot\.(startHour|endHour)/);
  assert.match(meetup, /endDayOffset/);
  assert.match(meetup, /candidateError/);
  assert.match(meetup, /重新加载地点/);
  assert.match(bottomBar, /!primary && !secondary && !hint/);
  assert.match(cst, /hour === 24 && minute === 0 && second === 0/);
});

test("countdown, CSS tokens, and knip config cover review regressions", () => {
  const countdown = readRepoFile(
    "apps/web/src/app/dashboard/_components/RevealCountdown.tsx",
  );
  const dashboardCss = readRepoFile("apps/web/src/app/dashboard/dashboard.css");
  const knip = JSON.parse(readRepoFile("knip.json"));

  assert.doesNotMatch(countdown, /useState<number>\(\(\) => Date\.now\(\)\)/);
  assert.match(countdown, /clearInterval/);
  assert.match(countdown, /setMounted/);

  for (const token of [
    "--warn",
    "--bg-muted",
    "--danger",
    "--danger-soft",
    "--stage-complete",
    "--stage-active",
    "--stage-pending-soft",
  ]) {
    assert.doesNotMatch(dashboardCss, new RegExp(`${token}(?![a-z-])`));
  }

  assert.deepEqual(knip.workspaces["."].entry, [
    "scripts/**/*.cjs",
    "scripts/**/*.mjs",
  ]);
  assert.deepEqual(knip.workspaces["."].project, [
    "scripts/**/*.cjs",
    "scripts/**/*.mjs",
  ]);
});
