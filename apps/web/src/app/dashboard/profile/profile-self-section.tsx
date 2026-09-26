import type { Dispatch, SetStateAction } from "react";
import {
  QuestionField,
  QuestionHeading,
  ScaleChoice,
  ChoiceOption,
  QuestionChoices,
} from "./question-components";
import {
  HARD_MATCH_KEYS,
  HARD_MATCH_GENDERS,
  HARD_MATCH_LOOKS,
  type HardMatchFormState,
} from "@lilink/shared";
import { ValuePicker, type ValuePickerOption } from "../_components/ValuePicker";
import { buildDashboardFieldId } from "../_lib/format";
import { profileAttentionElementId } from "../_lib/profile-attention";
import { dcx } from "../_lib/dashboard-class-names";
import type { ProfileAttentionDisplay } from "./use-profile-attention";
import type { ProfileFieldRegistry } from "./use-profile-field-registry";
import { HARD_MATCH_FIELD_KEY_GROUPS, type ProfileTab } from "./profile-field-state";
import styles from "./profile-redesign.module.css";
import { useEffect, useMemo } from "react";
import { calculateAgeOnDate } from "@lilink/shared";
import { BirthDatePicker } from "../_components/BirthDatePicker";
import {
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  BIRTH_YEAR_OPTIONS,
  buildDayOptions,
} from "@lilink/shared";
import { ContactEditor, type ContactSaveStatus } from "./contact-editor";
import type { Question, ContactPreferencesPayload } from "../_lib/types";
import {
  HEIGHT_VALUE_OPTIONS,
  WEIGHT_VALUE_OPTIONS,
  LOOKS_DESCRIPTIONS,
} from "./profile-field-state";

export function ProfileSelfSection({
  activeTab,
  displayName,
  setDisplayName,
  hardMatchForm,
  setHardMatchForm,
  userId,
  email,
  contactPreferences,
  setContactSaveStatus,
  onContactNavigateBlocked,
  lifestyleQuestions,
  answers,
  setAnswers,
  setAttentionBlockRef,
  attentionBlockClassName,
  renderAttentionNote,
  questionOptions,
}: {
  activeTab: ProfileTab;
  displayName: string;
  setDisplayName: (name: string) => void;
  hardMatchForm: HardMatchFormState;
  setHardMatchForm: Dispatch<SetStateAction<HardMatchFormState>>;
  userId: string;
  email: string;
  contactPreferences: ContactPreferencesPayload;
  setContactSaveStatus: (status: ContactSaveStatus) => void;
  onContactNavigateBlocked: () => void;
  lifestyleQuestions: Question[];
  answers: Record<string, unknown>;
  setAnswers: Dispatch<SetStateAction<Record<string, unknown>>>;
  setAttentionBlockRef: ProfileFieldRegistry["setAttentionBlockRef"];
  questionOptions: (id: string, options: ValuePickerOption[], value: string) => ValuePickerOption[];
} & ProfileAttentionDisplay) {
  const birthDayOptions = useMemo(
    () => buildDayOptions(hardMatchForm.birthYear, hardMatchForm.birthMonth),
    [hardMatchForm.birthMonth, hardMatchForm.birthYear]
  );

  useEffect(() => {
    if (!hardMatchForm.birthDay) return;
    if (!birthDayOptions.includes(Number(hardMatchForm.birthDay))) {
      setHardMatchForm((current) => ({ ...current, birthDay: "" }));
    }
  }, [birthDayOptions, hardMatchForm.birthDay, setHardMatchForm]);

  return (
    <div
      data-reader-module="self"
      hidden={activeTab !== "self"}
      className={`${dcx("app-q-group")} ${styles.selfFlat}`}
    >
      <section className={styles.identity} aria-label="自我介绍">
        <div className={styles.sectionHeading}>
          <h2>自我介绍</h2>
          <p>对匹配对象展示</p>
        </div>
        <div className={styles.introductionCard}>
          <label
            data-reader-item
            data-reader-title="昵称"
            id={profileAttentionElementId("nickname")}
          >
            昵称
            <span className={styles.nameInput}>
              <input
                value={displayName}
                maxLength={30}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="希望 TA 怎样称呼你"
              />
            </span>
          </label>
          <label
            data-reader-item
            data-reader-title="一句话介绍"
            className={styles.introQuestion}
            id={profileAttentionElementId(HARD_MATCH_KEYS.oneLinerIntro)}
          >
            一句话介绍<span className={styles.introHint}>让对方从一句话开始了解你</span>
            <span className={styles.introEditor}>
              <textarea
                rows={5}
                maxLength={HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH}
                value={hardMatchForm.oneLinerIntro}
                onChange={(event) =>
                  setHardMatchForm((form) => ({ ...form, oneLinerIntro: event.target.value }))
                }
                placeholder="比如：喜欢散步和独立电影，期待遇见能一起分享日常的人。"
              />
              <span className={styles.charCount}>
                {hardMatchForm.oneLinerIntro.length} / {HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH}
              </span>
            </span>
          </label>
        </div>
        <div data-reader-item aria-label="联系方式">
          <ContactEditor
            key={userId}
            userId={userId}
            onStatus={setContactSaveStatus}
            onNavigateBlocked={onContactNavigateBlocked}
            initial={contactPreferences}
            email={email}
          />
        </div>
      </section>
      <section className={styles.basicSection} aria-label="出生日期、性别与颜值自评">
        <div className={dcx("question-list")}>
          <QuestionField
            data-reader-item
            id={profileAttentionElementId(HARD_MATCH_KEYS.birthDate)}
            ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.birthDate, node)}
            className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.birthDate)}
          >
            <QuestionHeading>{"出生日期"}</QuestionHeading>
            {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.birthDate)}
            <div className={styles.birthControls}>
              <select
                aria-label="出生年份"
                value={hardMatchForm.birthYear}
                onChange={(event) =>
                  setHardMatchForm((form) => ({
                    ...form,
                    birthYear: event.target.value,
                    birthDay: "",
                  }))
                }
              >
                <option value="">年</option>
                {BIRTH_YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year} 年
                  </option>
                ))}
              </select>
              <select
                aria-label="出生月份"
                value={hardMatchForm.birthMonth}
                onChange={(event) =>
                  setHardMatchForm((form) => ({
                    ...form,
                    birthMonth: event.target.value,
                    birthDay: "",
                  }))
                }
              >
                <option value="">月</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month}>
                    {month} 月
                  </option>
                ))}
              </select>
              <select
                aria-label="出生日期中的日"
                value={hardMatchForm.birthDay}
                disabled={!hardMatchForm.birthYear || !hardMatchForm.birthMonth}
                onChange={(event) =>
                  setHardMatchForm((form) => ({ ...form, birthDay: event.target.value }))
                }
              >
                <option value="">日</option>
                {Array.from(
                  {
                    length: new Date(
                      Number(hardMatchForm.birthYear) || 2000,
                      Number(hardMatchForm.birthMonth) || 1,
                      0
                    ).getDate(),
                  },
                  (_, i) => i + 1
                ).map((day) => (
                  <option key={day} value={day}>
                    {day} 日
                  </option>
                ))}
              </select>
              <BirthDatePicker
                minYear={Math.min(...BIRTH_YEAR_OPTIONS)}
                maxYear={Math.max(...BIRTH_YEAR_OPTIONS)}
                value={
                  hardMatchForm.birthYear && hardMatchForm.birthMonth && hardMatchForm.birthDay
                    ? `${hardMatchForm.birthYear}-${hardMatchForm.birthMonth.padStart(2, "0")}-${hardMatchForm.birthDay.padStart(2, "0")}`
                    : ""
                }
                onChange={(value) => {
                  const [birthYear, birthMonth, birthDay] = value.split("-");
                  setHardMatchForm((form) => ({
                    ...form,
                    birthYear,
                    birthMonth: String(Number(birthMonth)),
                    birthDay: String(Number(birthDay)),
                  }));
                }}
              />
            </div>
            {hardMatchForm.birthYear && hardMatchForm.birthMonth && hardMatchForm.birthDay && (
              <p className={styles.rangeSummary}>
                你现在{" "}
                <strong>
                  {calculateAgeOnDate(
                    `${hardMatchForm.birthYear}-${hardMatchForm.birthMonth.padStart(2, "0")}-${hardMatchForm.birthDay.padStart(2, "0")}`,
                    new Date()
                  )}
                </strong>{" "}
                岁
              </p>
            )}
          </QuestionField>

          <QuestionField
            data-reader-item
            id={profileAttentionElementId(HARD_MATCH_KEYS.gender)}
            ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.gender, node)}
            className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.gender)}
          >
            <QuestionHeading>{"性别"}</QuestionHeading>
            {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.gender)}
            <QuestionChoices layout="list">
              {HARD_MATCH_GENDERS.map((g, i) => (
                <ChoiceOption key={g}>
                  <input
                    checked={hardMatchForm.gender === g}
                    id={buildDashboardFieldId("gender", i)}
                    type="radio"
                    name="gender"
                    onChange={() => setHardMatchForm((f) => ({ ...f, gender: g }))}
                  />
                  <span>{g}</span>
                </ChoiceOption>
              ))}
            </QuestionChoices>
          </QuestionField>

          <QuestionField
            data-reader-item
            id={profileAttentionElementId(HARD_MATCH_KEYS.looks)}
            ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.looks, node)}
            className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.looks)}
          >
            <QuestionHeading>{"颜值自评"}</QuestionHeading>
            {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.looks)}
            <ScaleChoice
              unit="分"
              label="颜值自评"
              name="looks"
              value={hardMatchForm.looks}
              options={HARD_MATCH_LOOKS.map((value) => ({ value, label: value }))}
              onChange={(looks) => setHardMatchForm((form) => ({ ...form, looks }))}
            />
            <p className={styles.ratingDescription}>
              {LOOKS_DESCRIPTIONS[Number(hardMatchForm.looks)] || "选择一个分数，查看对应说明。"}
            </p>
          </QuestionField>
        </div>
      </section>
      <section className={styles.basicSection} aria-label="身高与体重">
        <div className={dcx("question-list")}>
          <QuestionField
            data-reader-item
            id={profileAttentionElementId(HARD_MATCH_KEYS.heightCm)}
            ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.heightCm, node)}
            className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.heightCm)}
          >
            <QuestionHeading>{"身高"}</QuestionHeading>
            {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.heightCm)}
            <ValuePicker
              id={buildDashboardFieldId("height-cm")}
              name="heightCm"
              value={hardMatchForm.heightCm}
              options={questionOptions(
                buildDashboardFieldId("height-cm"),
                HEIGHT_VALUE_OPTIONS,
                hardMatchForm.heightCm
              )}
              suffix="cm"
              placeholder="请选择身高"
              ariaLabel="选择你的身高"
              onChange={(next) => setHardMatchForm((f) => ({ ...f, heightCm: next }))}
            />
          </QuestionField>

          <QuestionField
            data-reader-item
            id={profileAttentionElementId(HARD_MATCH_KEYS.weightKg)}
            ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.weightKg, node)}
            className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.weightKg)}
          >
            <QuestionHeading>{"体重"}</QuestionHeading>
            {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.weightKg)}
            <ValuePicker
              id={buildDashboardFieldId("weight-kg")}
              name="weightKg"
              value={hardMatchForm.weightKg}
              options={questionOptions(
                buildDashboardFieldId("weight-kg"),
                WEIGHT_VALUE_OPTIONS,
                hardMatchForm.weightKg
              )}
              placeholder="请选择体重"
              ariaLabel="选择你的体重"
              onChange={(next) => setHardMatchForm((f) => ({ ...f, weightKg: next }))}
            />
          </QuestionField>
        </div>
      </section>
      <section className={styles.lifestyleSection} aria-label="锻炼、吸烟与饮酒">
        <div className={dcx("question-list")}>
          {lifestyleQuestions.map((question) => (
            <QuestionField
              data-reader-item
              key={question.key}
              id={profileAttentionElementId(question.key)}
              ref={(node) => setAttentionBlockRef([question.key], node)}
              className={attentionBlockClassName([question.key])}
            >
              <QuestionHeading>
                {question.key === "exercise_frequency" ? "锻炼情况" : question.prompt}
              </QuestionHeading>
              {renderAttentionNote([question.key])}
              <QuestionChoices layout="list">
                {question.options?.map((option) => (
                  <ChoiceOption key={option.value}>
                    <input
                      type="radio"
                      name={question.key}
                      checked={answers[question.key] === option.value}
                      onChange={() =>
                        setAnswers((current) => ({ ...current, [question.key]: option.value }))
                      }
                    />
                    <span>{option.label}</span>
                  </ChoiceOption>
                ))}
              </QuestionChoices>
            </QuestionField>
          ))}
        </div>
      </section>
    </div>
  );
}
