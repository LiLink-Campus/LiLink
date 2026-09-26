import type { Dispatch, SetStateAction } from "react";
import {
  QuestionField,
  QuestionHeading,
  ChoiceOption,
  QuestionChoices,
} from "./question-components";
import type { Question } from "../_lib/types";
import { profileAttentionElementId } from "../_lib/profile-attention";
import { buildDashboardFieldId } from "../_lib/format";
import { dcx } from "../_lib/dashboard-class-names";
import type { ProfileAttentionDisplay } from "./use-profile-attention";
import type { ProfileFieldRegistry } from "./use-profile-field-registry";
import type { ProfileTab } from "./profile-field-state";
import styles from "./profile-redesign.module.css";

export function ProfileValuesSection({
  activeTab,
  valuesQuestions,
  answers,
  setAnswers,
  setAttentionBlockRef,
  attentionBlockClassName,
  renderAttentionNote,
}: {
  activeTab: ProfileTab;
  valuesQuestions: Question[];
  answers: Record<string, unknown>;
  setAnswers: Dispatch<SetStateAction<Record<string, unknown>>>;
  setAttentionBlockRef: ProfileFieldRegistry["setAttentionBlockRef"];
} & ProfileAttentionDisplay) {
  return (
    <>
      {valuesQuestions.length > 0 && (
        <div
          data-reader-module="values"
          hidden={activeTab !== "values"}
          className={dcx("app-q-group")}
        >
          <p className={styles.moduleDescription}>
            共 {valuesQuestions.length} 题，帮助算法了解你的价值观与相处偏好。
          </p>
          <div className={dcx("question-list")}>
            {valuesQuestions.map((question, questionIndex) => {
              const value = answers[question.key];
              const questionTitle = <QuestionHeading>{question.prompt}</QuestionHeading>;

              if (question.type === "MULTI_SELECT") {
                const selected = Array.isArray(value) ? value : [];
                const selectionLimit = question.selectionLimit ?? null;
                const reachedSelectionLimit =
                  selectionLimit != null && selected.length >= selectionLimit;
                return (
                  <QuestionField
                    data-reader-item
                    key={question.id}
                    ref={(node) => setAttentionBlockRef([question.key], node)}
                    id={profileAttentionElementId(question.key)}
                    className={attentionBlockClassName([question.key])}
                  >
                    {questionTitle}
                    {renderAttentionNote([question.key])}
                    {selectionLimit != null ? (
                      <p className={dcx("app-muted")}>本题必须选择 {selectionLimit} 项。</p>
                    ) : null}
                    <QuestionChoices
                      layout={
                        questionIndex < 14 ||
                        question.options?.some((option) => option.label.length > 12)
                          ? "list"
                          : "tiles"
                      }
                    >
                      {question.options?.map((option, optionIndex) => {
                        const active = selected.includes(option.value);
                        return (
                          <ChoiceOption
                            key={option.value}
                            className={dcx(active ? "chip active" : "chip")}
                          >
                            <input
                              checked={active}
                              disabled={!active && reachedSelectionLimit}
                              id={buildDashboardFieldId("question", question.id, optionIndex)}
                              name={question.key}
                              type="checkbox"
                              onChange={() =>
                                setAnswers((current) => {
                                  const cur = Array.isArray(current[question.key])
                                    ? (current[question.key] as string[])
                                    : [];
                                  if (active) {
                                    return {
                                      ...current,
                                      [question.key]: cur.filter((v) => v !== option.value),
                                    };
                                  }

                                  if (selectionLimit != null && cur.length >= selectionLimit) {
                                    return current;
                                  }

                                  return {
                                    ...current,
                                    [question.key]: [...cur, option.value],
                                  };
                                })
                              }
                            />
                            <span>{option.label}</span>
                          </ChoiceOption>
                        );
                      })}
                    </QuestionChoices>
                  </QuestionField>
                );
              }

              return (
                <QuestionField
                  data-reader-item
                  key={question.id}
                  ref={(node) => setAttentionBlockRef([question.key], node)}
                  id={profileAttentionElementId(question.key)}
                  className={attentionBlockClassName([question.key])}
                >
                  {questionTitle}
                  {renderAttentionNote([question.key])}
                  <QuestionChoices
                    layout={
                      questionIndex < 14 ||
                      question.options?.some((option) => option.label.length > 12)
                        ? "list"
                        : "tiles"
                    }
                  >
                    {question.options?.map((option, optionIndex) => (
                      <ChoiceOption key={option.value}>
                        <input
                          checked={value === option.value}
                          id={buildDashboardFieldId("question", question.id, optionIndex)}
                          type="radio"
                          name={question.key}
                          onChange={() =>
                            setAnswers((current) => ({
                              ...current,
                              [question.key]: option.value,
                            }))
                          }
                        />
                        <span>{option.label}</span>
                      </ChoiceOption>
                    ))}
                  </QuestionChoices>
                </QuestionField>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
