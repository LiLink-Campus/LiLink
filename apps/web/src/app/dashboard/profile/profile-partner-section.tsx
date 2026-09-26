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
import { LIFESTYLE_QUESTIONS } from "@lilink/shared";
import { toggleMultiSelectValue, type HardMatchSchoolOption } from "@lilink/shared";
import { LifestylePreferenceChoices } from "./lifestyle-preference-choices";
import {
  AGE_VALUE_OPTIONS,
  HEIGHT_VALUE_OPTIONS,
  PARTNER_WEIGHT_VALUE_OPTIONS,
} from "./profile-field-state";
import { ProfileSchoolExclusions } from "./profile-school-exclusions";

export function ProfilePartnerSection({
  activeTab,
  hardMatchForm,
  setHardMatchForm,
  vipActive,
  onRequireVip,
  schoolOptions,
  setAttentionBlockRef,
  attentionBlockClassName,
  renderAttentionNote,
  questionOptions,
}: {
  activeTab: ProfileTab;
  hardMatchForm: HardMatchFormState;
  setHardMatchForm: Dispatch<SetStateAction<HardMatchFormState>>;
  vipActive: boolean;
  onRequireVip: () => void;
  schoolOptions: HardMatchSchoolOption[];
  setAttentionBlockRef: ProfileFieldRegistry["setAttentionBlockRef"];
  questionOptions: (id: string, options: ValuePickerOption[], value: string) => ValuePickerOption[];
} & ProfileAttentionDisplay) {
  function updatePremiumForm(update: SetStateAction<HardMatchFormState>) {
    if (!vipActive) {
      onRequireVip();
      return;
    }
    setHardMatchForm(update);
  }
  function toggleHardSelection(field: "partnerGenders" | "partnerLooks", nextValue: string) {
    setHardMatchForm((current) => ({
      ...current,
      [field]: toggleMultiSelectValue(current[field], nextValue),
    }));
  }

  return (
    <div
      data-reader-module="partner"
      hidden={activeTab !== "partner"}
      className={dcx("app-q-group")}
    >
      <div className={dcx("question-list")}>
        <section className={styles.partnerBasics} aria-label="希望对方年龄与性别">
          <QuestionField
            data-reader-item
            id={profileAttentionElementId(HARD_MATCH_KEYS.partnerAgeMin)}
            ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.partnerAge, node)}
            className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.partnerAge)}
          >
            <QuestionHeading>{"希望对方年龄"}</QuestionHeading>
            {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerAge)}
            <div className={styles.ageInputs}>
              <label>
                <span>年龄下限</span>
                <ValuePicker
                  id={buildDashboardFieldId("partner-age-min")}
                  name="partnerAgeMin"
                  value={hardMatchForm.partnerAgeMin}
                  options={questionOptions(
                    buildDashboardFieldId("partner-age-min"),
                    AGE_VALUE_OPTIONS,
                    hardMatchForm.partnerAgeMin
                  )}
                  suffix="岁"
                  placeholder="请选择"
                  ariaLabel="对方年龄下限"
                  onChange={(next) => setHardMatchForm((f) => ({ ...f, partnerAgeMin: next }))}
                />
              </label>
              <label>
                <span>年龄上限</span>
                <ValuePicker
                  id={buildDashboardFieldId("partner-age-max")}
                  name="partnerAgeMax"
                  value={hardMatchForm.partnerAgeMax}
                  options={questionOptions(
                    buildDashboardFieldId("partner-age-max"),
                    AGE_VALUE_OPTIONS,
                    hardMatchForm.partnerAgeMax
                  )}
                  suffix="岁"
                  placeholder="请选择"
                  ariaLabel="对方年龄上限"
                  onChange={(next) => setHardMatchForm((f) => ({ ...f, partnerAgeMax: next }))}
                />
              </label>
            </div>
            <p className={styles.rangeSummary}>
              {hardMatchForm.partnerAgeMin} — {hardMatchForm.partnerAgeMax} 岁
            </p>
          </QuestionField>

          <QuestionField
            data-reader-item
            id={profileAttentionElementId(HARD_MATCH_KEYS.partnerGenders)}
            ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.partnerGenders, node)}
            className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.partnerGenders)}
          >
            <QuestionHeading>{"希望对方的性别（可多选）"}</QuestionHeading>
            {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerGenders)}
            <QuestionChoices layout="list">
              {HARD_MATCH_GENDERS.map((g, i) => {
                const active = hardMatchForm.partnerGenders.includes(g);
                return (
                  <ChoiceOption key={g} className={dcx(active ? "chip active" : "chip")}>
                    <input
                      checked={active}
                      id={buildDashboardFieldId("partner-genders", i)}
                      name="partnerGenders"
                      type="checkbox"
                      onChange={() => toggleHardSelection("partnerGenders", g)}
                    />
                    <span>{g}</span>
                  </ChoiceOption>
                );
              })}
            </QuestionChoices>
          </QuestionField>
        </section>

        <QuestionField
          data-reader-item
          className={styles.partnerLifestyle}
          id={profileAttentionElementId(HARD_MATCH_KEYS.partnerSmokingStatus)}
        >
          <QuestionHeading>{"希望对方吸烟情况"}</QuestionHeading>

          <LifestylePreferenceChoices
            value={hardMatchForm.partnerSmokingStatus}
            options={LIFESTYLE_QUESTIONS[1].options}
            onChange={(value) =>
              setHardMatchForm((form) => ({ ...form, partnerSmokingStatus: value }))
            }
          />
        </QuestionField>

        <QuestionField
          data-reader-item
          className={styles.partnerLifestyle}
          id={profileAttentionElementId(HARD_MATCH_KEYS.partnerDrinkingFrequency)}
        >
          <QuestionHeading>{"希望对方饮酒频率"}</QuestionHeading>

          <LifestylePreferenceChoices
            value={hardMatchForm.partnerDrinkingFrequency}
            options={LIFESTYLE_QUESTIONS[2].options}
            onChange={(value) =>
              setHardMatchForm((form) => ({ ...form, partnerDrinkingFrequency: value }))
            }
          />
        </QuestionField>

        <QuestionField
          data-reader-item
          className={styles.partnerLifestyle}
          id={profileAttentionElementId(HARD_MATCH_KEYS.partnerExerciseFrequency)}
        >
          <QuestionHeading>{"希望对方锻炼频率"}</QuestionHeading>
          <p className={styles.premiumHint}>
            高级筛选 · {vipActive ? "VIP 已启用" : "需要 VIP，开通后可设置"}
          </p>
          <LifestylePreferenceChoices
            value={hardMatchForm.partnerExerciseFrequency}
            options={LIFESTYLE_QUESTIONS[0].options}
            onChange={(value) =>
              updatePremiumForm((form) => ({ ...form, partnerExerciseFrequency: value }))
            }
          />
        </QuestionField>
        <div className={styles.premiumFields}>
          <QuestionField
            data-reader-item
            id={profileAttentionElementId(HARD_MATCH_KEYS.partnerLooks)}
            ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.partnerLooks, node)}
            className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.partnerLooks)}
          >
            <QuestionHeading>{"希望对方的颜值至少几分？"}</QuestionHeading>
            <p className={styles.premiumHint}>
              高级筛选 · {vipActive ? "VIP 已启用" : "需要 VIP，开通后可设置"}
            </p>
            {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerLooks)}
            <ScaleChoice
              unit="分及以上"
              name="partnerLooksMinimum"
              label="对方颜值最低分"
              value={
                hardMatchForm.partnerLooks.some((value) => Number.isFinite(Number(value)))
                  ? String(
                      Math.min(...hardMatchForm.partnerLooks.map(Number).filter(Number.isFinite))
                    )
                  : "1"
              }
              options={HARD_MATCH_LOOKS.map((value) => ({ value, label: `${value}分及以上` }))}
              onChange={(value) =>
                updatePremiumForm((form) => ({
                  ...form,
                  partnerLooks: HARD_MATCH_LOOKS.filter((score) => Number(score) >= Number(value)),
                }))
              }
            />
            <p className={styles.ratingDescription}>
              {hardMatchForm.partnerLooks.length
                ? `${Math.min(...hardMatchForm.partnerLooks.map(Number).filter(Number.isFinite), 10)} 分及以上`
                : "1 分及以上"}
            </p>
          </QuestionField>

          <QuestionField
            data-reader-item
            id={profileAttentionElementId(HARD_MATCH_KEYS.partnerHeightMin)}
            ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.partnerHeight, node)}
            className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.partnerHeight)}
          >
            <QuestionHeading>{"希望对方的身高范围"}</QuestionHeading>
            <p className={styles.premiumHint}>
              高级筛选 · {vipActive ? "VIP 已启用" : "需要 VIP，开通后可设置"}
            </p>
            {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerHeight)}
            <div className={dcx("form-grid")}>
              <label>
                <span>最低</span>
                <ValuePicker
                  id={buildDashboardFieldId("partner-height-min")}
                  name="partnerHeightMin"
                  value={hardMatchForm.partnerHeightMin}
                  options={questionOptions(
                    buildDashboardFieldId("partner-height-min"),
                    HEIGHT_VALUE_OPTIONS,
                    hardMatchForm.partnerHeightMin
                  )}
                  suffix="cm"
                  placeholder="请选择"
                  ariaLabel="希望对方身高下限"
                  onChange={(next) =>
                    updatePremiumForm((f) => ({
                      ...f,
                      partnerHeightMin: next,
                    }))
                  }
                />
              </label>
              <label>
                <span>最高</span>
                <ValuePicker
                  id={buildDashboardFieldId("partner-height-max")}
                  name="partnerHeightMax"
                  value={hardMatchForm.partnerHeightMax}
                  options={questionOptions(
                    buildDashboardFieldId("partner-height-max"),
                    HEIGHT_VALUE_OPTIONS,
                    hardMatchForm.partnerHeightMax
                  )}
                  suffix="cm"
                  placeholder="请选择"
                  ariaLabel="希望对方身高上限"
                  onChange={(next) =>
                    updatePremiumForm((f) => ({
                      ...f,
                      partnerHeightMax: next,
                    }))
                  }
                />
              </label>
            </div>
          </QuestionField>

          <QuestionField
            data-reader-item
            id={profileAttentionElementId(HARD_MATCH_KEYS.partnerWeightMin)}
            ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.partnerWeight, node)}
            className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.partnerWeight)}
          >
            <QuestionHeading>{"希望对方的体重范围"}</QuestionHeading>
            <p className={styles.premiumHint}>
              高级筛选 · {vipActive ? "VIP 已启用" : "需要 VIP，开通后可设置"}
            </p>
            {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerWeight)}
            <div className={dcx("form-grid")}>
              <label>
                <span>最低</span>
                <ValuePicker
                  id={buildDashboardFieldId("partner-weight-min")}
                  name="partnerWeightMin"
                  value={hardMatchForm.partnerWeightMin}
                  options={questionOptions(
                    buildDashboardFieldId("partner-weight-min"),
                    PARTNER_WEIGHT_VALUE_OPTIONS,
                    hardMatchForm.partnerWeightMin
                  )}
                  placeholder="不限"
                  ariaLabel="希望对方体重下限"
                  onChange={(next) =>
                    updatePremiumForm((f) => ({
                      ...f,
                      partnerWeightMin: next,
                    }))
                  }
                />
              </label>
              <label>
                <span>最高</span>
                <ValuePicker
                  id={buildDashboardFieldId("partner-weight-max")}
                  name="partnerWeightMax"
                  value={hardMatchForm.partnerWeightMax}
                  options={questionOptions(
                    buildDashboardFieldId("partner-weight-max"),
                    PARTNER_WEIGHT_VALUE_OPTIONS,
                    hardMatchForm.partnerWeightMax
                  )}
                  placeholder="不限"
                  ariaLabel="希望对方体重上限"
                  onChange={(next) =>
                    updatePremiumForm((f) => ({
                      ...f,
                      partnerWeightMax: next,
                    }))
                  }
                />
              </label>
            </div>
          </QuestionField>

          <ProfileSchoolExclusions
            exclusions={hardMatchForm}
            schoolOptions={schoolOptions}
            vipActive={vipActive}
            onRequireVip={onRequireVip}
            onChange={(update) =>
              setHardMatchForm((current) => ({
                ...current,
                ...(typeof update === "function" ? update(current) : update),
              }))
            }
            setAttentionBlockRef={setAttentionBlockRef}
            attentionBlockClassName={attentionBlockClassName}
            renderAttentionNote={renderAttentionNote}
          />
        </div>
      </div>
    </div>
  );
}
