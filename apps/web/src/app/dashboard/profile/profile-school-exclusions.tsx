import { useState, type SetStateAction } from "react";
import { QuestionField, QuestionHeading, ChoiceOption } from "./question-components";
import {
  HARD_MATCH_GENDERS,
  HARD_MATCH_KEYS,
  schoolGenderExclusionFor,
  setSchoolGenderExclusion,
  toggleMultiSelectValue,
  type HardMatchSchoolOption,
  type HardMatchFormState,
} from "@lilink/shared";
import { useMatchEstimate } from "./use-match-estimate";
import type { MatchEstimateBand } from "@lilink/shared";
import { profileAttentionElementId } from "../_lib/profile-attention";
import { buildDashboardFieldId } from "../_lib/format";
import { dcx } from "../_lib/dashboard-class-names";
import { HARD_MATCH_FIELD_KEY_GROUPS } from "./profile-field-state";
import type { ProfileAttentionDisplay } from "./use-profile-attention";
import type { ProfileFieldRegistry } from "./use-profile-field-registry";
import styles from "./profile-redesign.module.css";

type SchoolExclusions = Pick<
  HardMatchFormState,
  "excludedPartnerSchools" | "excludedPartnerSchoolGenders"
>;

const MATCH_ESTIMATE_BAND_LABELS: Record<MatchEstimateBand, string> = {
  HIGH: "较高",
  MEDIUM: "中等",
  LOW: "较低",
  VERY_LOW: "极低",
};

const MATCH_ESTIMATE_BAND_MODIFIERS: Record<MatchEstimateBand, string> = {
  HIGH: "is-high",
  MEDIUM: "is-medium",
  LOW: "is-low",
  VERY_LOW: "is-very-low",
};

function activeExcludedGendersFor(
  hardMatchForm: SchoolExclusions,
  schoolId: string
): readonly string[] {
  if (hardMatchForm.excludedPartnerSchools.includes(schoolId)) {
    return HARD_MATCH_GENDERS;
  }

  return schoolGenderExclusionFor(hardMatchForm.excludedPartnerSchoolGenders, schoolId);
}

export function ProfileSchoolExclusions({
  exclusions,
  onChange,
  schoolOptions,
  vipActive,
  onRequireVip,
  setAttentionBlockRef,
  attentionBlockClassName,
  renderAttentionNote,
}: {
  exclusions: SchoolExclusions;
  onChange: (update: SetStateAction<SchoolExclusions>) => void;
  schoolOptions: HardMatchSchoolOption[];
  vipActive: boolean;
  onRequireVip: () => void;
  setAttentionBlockRef: ProfileFieldRegistry["setAttentionBlockRef"];
} & ProfileAttentionDisplay) {
  const [schoolSearch, setSchoolSearch] = useState("");
  const { matchEstimate, matchEstimatePending } = useMatchEstimate({
    excludedPartnerSchools: exclusions.excludedPartnerSchools,
    excludedPartnerSchoolGenders: exclusions.excludedPartnerSchoolGenders,
  }, vipActive);

  function toggleExcludedPartnerSchoolGender(schoolId: string, gender: string) {
    onChange((current) => {
      const currentActive = activeExcludedGendersFor(current, schoolId);
      const nextActive = toggleMultiSelectValue([...currentActive], gender);
      const isNowFullyExcluded = nextActive.length === HARD_MATCH_GENDERS.length;
      const baseSchools = current.excludedPartnerSchools.filter((item) => item !== schoolId);

      return {
        ...current,
        excludedPartnerSchools: isNowFullyExcluded ? [...baseSchools, schoolId] : baseSchools,
        excludedPartnerSchoolGenders: setSchoolGenderExclusion(
          current.excludedPartnerSchoolGenders,
          schoolId,
          isNowFullyExcluded ? [] : nextActive
        ),
      };
    });
  }

  return (
    <QuestionField
      data-reader-item
      id={profileAttentionElementId(HARD_MATCH_KEYS.excludedPartnerSchools)}
      ref={(node) => setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.excludedPartnerSchools, node)}
      className={attentionBlockClassName(HARD_MATCH_FIELD_KEY_GROUPS.excludedPartnerSchools)}
    >
      <QuestionHeading>{"按学校排除（可选）"}</QuestionHeading>
      <p className={styles.premiumHint}>
        高级筛选 · {vipActive ? "VIP 已启用" : "需要 VIP，开通后可设置"}
      </p>
      {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.excludedPartnerSchools)}
      <p className={dcx("app-muted")}>可排除不希望匹配的学校或性别。</p>
      {matchEstimate ? (
        <p
          className={dcx(
            `match-estimate-hint ${MATCH_ESTIMATE_BAND_MODIFIERS[matchEstimate.band]}${matchEstimatePending ? " is-pending" : ""}`
          )}
          role="status"
          aria-live="polite"
        >
          <span className={dcx("match-estimate-hint-label")}>排除后匹配到的概率：</span>
          <strong className={dcx("match-estimate-hint-band")}>
            {MATCH_ESTIMATE_BAND_LABELS[matchEstimate.band]}
          </strong>
          {matchEstimate.lowConfidence ? (
            <span className={dcx("match-estimate-hint-caveat")}>当前候选人较少，仅供参考</span>
          ) : null}
        </p>
      ) : null}
      <input
        className={styles.schoolSearch}
        aria-label="搜索学校"
        placeholder="搜索学校名称"
        value={schoolSearch}
        onChange={(event) => setSchoolSearch(event.target.value)}
      />
      <div className={styles.schoolList}>
        {schoolOptions
          .filter((school) => school.name.includes(schoolSearch.trim()))
          .map((school, i) => {
            const activeGenders = activeExcludedGendersFor(exclusions, school.id);
            const isFullyExcluded = activeGenders.length === HARD_MATCH_GENDERS.length;
            const isPartiallyExcluded = !isFullyExcluded && activeGenders.length > 0;
            return (
              <details key={school.id} className={styles.schoolRow}>
                <summary className={styles.schoolSummary}>
                  <span className={dcx("school-exclusion-name-text")} title={school.name}>
                    {school.name}
                  </span>
                  {isFullyExcluded ? (
                    <span className={dcx("school-exclusion-status is-strong")}>整校排除</span>
                  ) : isPartiallyExcluded ? (
                    <span className={dcx("school-exclusion-status")}>
                      已排除：{activeGenders.join("、")}
                    </span>
                  ) : (
                    <span className={styles.schoolStatus}>不排除</span>
                  )}
                  <svg
                    className={styles.schoolChevron}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="m6 9 6 6 6-6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </summary>
                <div
                  className={dcx("school-exclusion-genders")}
                  role="group"
                  aria-label={`${school.name} 排除性别`}
                >
                  {HARD_MATCH_GENDERS.map((gender, genderIndex) => {
                    const active = activeGenders.includes(gender);
                    return (
                      <ChoiceOption
                        key={gender}
                        className={
                          active
                            ? dcx("school-exclusion-gender is-active")
                            : dcx("school-exclusion-gender")
                        }
                      >
                        <input
                          checked={active}
                          id={buildDashboardFieldId(
                            "excluded-partner-school-gender",
                            i,
                            genderIndex
                          )}
                          name={`excludedPartnerSchoolGender-${school.id}`}
                          type="checkbox"
                          onChange={() =>
                            vipActive
                              ? toggleExcludedPartnerSchoolGender(school.id, gender)
                              : onRequireVip()
                          }
                        />
                        <span>{gender}</span>
                      </ChoiceOption>
                    );
                  })}
                </div>
              </details>
            );
          })}
        {!schoolOptions.some((school) => school.name.includes(schoolSearch.trim())) && (
          <p>没有找到匹配的学校</p>
        )}
      </div>
    </QuestionField>
  );
}
