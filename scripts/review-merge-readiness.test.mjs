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

test("match page keeps current-cycle states ahead of stale last-round unmatched copy", () => {
  const source = readRepoFile("apps/web/src/app/dashboard/match/match-client.tsx");

  assert.match(source, /const hasMissingIntent =/);
  assert.match(source, /const currentCycleIsLocked =/);

  const missingIntentIndex = indexOfOrThrow(
    source,
    "} else if (hasMissingIntent)",
    "missing-intent branch",
  );
  const lockedOptedInIndex = indexOfOrThrow(
    source,
    "currentCycle?.participationStatus === \"OPTED_IN\"",
    "locked opted-in branch",
  );
  const lastRoundIndex = indexOfOrThrow(
    source,
    "dashboard?.lastRevealedRound?.participationStatus === \"OPTED_IN\"",
    "last-round unmatched branch",
  );
  assert.ok(
    missingIntentIndex < lastRoundIndex,
    "missing current-cycle intent must not be hidden by last-round unmatched state",
  );
  assert.ok(
    lockedOptedInIndex < lastRoundIndex,
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

test("direct meetup invite only navigates after contact request succeeds", () => {
  const matchPage = readRepoFile("apps/web/src/app/dashboard/match/match-client.tsx");
  const matchActions = readRepoFile(
    "apps/web/src/app/dashboard/_components/useMatchActions.ts",
  );

  assert.match(
    matchActions,
    /async function requestContact\(matchId: string\): Promise<boolean>/,
  );
  assert.match(matchActions, /return true;/);
  assert.match(matchActions, /return false;/);
  assert.match(matchPage, /const contactRequested = await requestContact/);
  assert.match(matchPage, /if \(!contactRequested\) return;/);
});

test("profile and card editors expose and validate required public card fields", () => {
  const profile = readRepoFile("apps/web/src/app/dashboard/profile/profile-client.tsx");
  const card = readRepoFile("apps/web/src/app/dashboard/me/card/card-client.tsx");
  const me = readRepoFile("apps/web/src/app/dashboard/me/me-client.tsx");

  assert.doesNotMatch(profile, /name="oneLinerIntro"/);
  assert.match(profile, /HARD_MATCH_KEYS\.oneLinerIntro/);
  assert.match(profile, /acknowledgedHardMatchKeys/);
  assert.match(profile, /setAcknowledgedHardMatchKeys/);
  assert.match(profile, /item\.acknowledged \|\| acknowledgedHardMatchKeySet\.has\(item\.key\)/);
  assert.match(profile, /item\.updated && !item\.acknowledged && item\.missingRequired/);
  assert.match(card, /setOneLinerIntro/);
  assert.match(card, /HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH/);
  assert.match(card, /trimmedOneLinerIntro/);
  assert.match(card, /请填写一句话介绍。/);
  assert.match(card, /saveResult\.saveState !== "SUBMITTED"/);

  const contactSave = indexOfOrThrow(card, 'fetchApi("/me/contact-preferences"');
  const displayNameValidation = indexOfOrThrow(card, "trimmedDisplayName.length < 2");
  const oneLinerValidation = indexOfOrThrow(card, "trimmedOneLinerIntro.length === 0");
  assert.ok(
    displayNameValidation < contactSave,
    "card editor must validate display name before saving contact preferences",
  );
  assert.ok(
    oneLinerValidation < contactSave,
    "card editor must validate one-line intro before saving contact preferences",
  );

  assert.match(me, /hardMatchFormFromAnswers/);
  assert.doesNotMatch(me, /draft\?\.hardMatchForm\?\.oneLinerIntro/);
});

test("home questionnaire todo links to missing fields before updated defaults", () => {
  const agenda = readRepoFile("apps/web/src/app/dashboard/_lib/agenda.ts");
  const focus = readRepoFile("apps/web/src/app/dashboard/_lib/focus.ts");

  assert.match(focus, /type QuestionnaireHrefPreference = "pending" \| "missing"/);
  assert.match(agenda, /questionnaireHref\(q\.attention, "missing"\)/);
  assert.match(agenda, /questionnaireHref\(q\.attention, "pending"\)/);
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
