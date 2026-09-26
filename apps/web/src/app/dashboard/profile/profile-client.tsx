"use client";

import { useMemo, useRef, useState } from "react";
import { isLifestyleQuestion } from "@lilink/shared";
import { InteractiveFields } from "@/components/interactive-fields";
import type { AuthMePayload } from "../../../lib/api";
import {
  HARD_MATCH_LOOKS,
  hardMatchFormFromAnswers,
  type HardMatchSchoolOption,
} from "@lilink/shared";
import type { VipStatus } from "../vip/vip-client";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { keepCurrentQuestionAnswers } from "@lilink/shared";
import { dcx } from "../_lib/dashboard-class-names";
import type {
  ContactPreferencesPayload,
  DashboardPayload,
  Question,
  SavedQuestionnairePayload,
} from "../_lib/types";
import type { ContactSaveStatus } from "./contact-editor";
import { incompleteProfileTargets } from "./profile-field-state";
import { useProfileFieldRegistry } from "./use-profile-field-registry";
import { useProfileAttention } from "./use-profile-attention";
import { useProfileAutosave } from "./use-profile-autosave";
import { initialProfileTab, useProfileReader } from "./use-profile-reader";
import { ProfileVipDialog } from "./profile-vip-access";
import { useVipStatus } from "./use-vip-status";
import { ProfileSelfSection } from "./profile-self-section";
import { ProfilePartnerSection } from "./profile-partner-section";
import { ProfileValuesSection } from "./profile-values-section";
import {
  ProfileDesktopDirectory,
  ProfileDirectoryDialog,
  ProfileModuleTabs,
  ProfileReaderToolbar,
  ProfileReaderFooter,
} from "./profile-reader-navigation";
import { combinedSavePresentation, ProfileSaveNotice } from "./profile-save-notice";
import { profileSavePresentation } from "./save-status";
import { ReaderScrollHint } from "./reader-scroll-hint";
import styles from "./profile-redesign.module.css";

export function ProfileClient({
  initialUser,
  initialDashboard,
  initialQuestions,
  initialSchools,
  initialSavedQuestionnaire,
  initialContactPreferences,
  initialVip = null,
  initialQuestionnaireVersionId,
}: {
  initialQuestionnaireVersionId?: string;
  initialVip?: VipStatus | null;
  initialContactPreferences: ContactPreferencesPayload;
  initialUser: AuthMePayload;
  initialDashboard: Pick<DashboardPayload, "questionnaireSubmittedAt">;
  initialQuestions: Question[];
  initialSchools: HardMatchSchoolOption[];
  initialSavedQuestionnaire: SavedQuestionnairePayload;
}) {
  useDashboardSessionSeed(initialUser);
  const { vip, error: vipError } = useVipStatus(initialVip);
  const vipActive = Boolean(vip?.active);
  const vipDialogRef = useRef<HTMLDialogElement>(null);
  const initialDraft = initialSavedQuestionnaire?.draft ?? null;
  const [questions] = useState(initialQuestions);
  const [schoolOptions] = useState(initialSchools);
  const lifestyleQuestions = useMemo(
    () => questions.filter((question) => isLifestyleQuestion(question.key)),
    [questions]
  );
  const valuesQuestions = useMemo(
    () => questions.filter((question) => !isLifestyleQuestion(question.key)),
    [questions]
  );
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    () =>
      initialDraft?.softAnswers ??
      keepCurrentQuestionAnswers(initialQuestions, initialSavedQuestionnaire?.answers)
  );
  const [hardMatchForm, setHardMatchForm] = useState(() => {
    const loaded =
      initialDraft?.hardMatchForm ??
      hardMatchFormFromAnswers(initialSavedQuestionnaire?.answers, initialSchools);
    return {
      ...loaded,
      partnerLooks: loaded.partnerLooks.length ? loaded.partnerLooks : [...HARD_MATCH_LOOKS],
    };
  });
  const [displayName, setDisplayName] = useState(
    initialDraft?.displayName ?? initialUser.displayName ?? ""
  );
  const [contactSaveStatus, setContactSaveStatus] = useState<ContactSaveStatus>("saved");
  const payload = useMemo(
    () => ({ answers, hardMatchForm, displayName }),
    [answers, hardMatchForm, displayName]
  );
  const snapshot = useMemo(() => JSON.stringify(payload), [payload]);
  const incompleteTargets = incompleteProfileTargets({
    answers,
    hardMatchForm,
    displayName,
    questions,
    vipActive,
  });
  const { questionBlockRefs, setAttentionBlockRef } = useProfileFieldRegistry();
  const {
    activeTab,
    readerItems,
    currentIndex,
    itemIncomplete,
    openQuestion,
    changeModule,
    readerRef,
    onReaderChange,
    moduleItems,
    directoryRef,
    questionOptions,
    previousReaderModule,
    nextReaderModule,
    lastReaderQuestion,
    completedSnapshot,
    finishReader,
  } = useProfileReader({
    initialTab: initialProfileTab(initialQuestions, initialSavedQuestionnaire),
    questions,
    valuesQuestions,
    vipActive,
    questionBlockRefs,
    incompleteTargets,
    snapshot,
  });
  const attention = useProfileAttention({
    userId: initialUser.id,
    initialAttention: initialSavedQuestionnaire?.attention ?? null,
    answers,
    hardMatchForm,
    questions,
    vipActive,
    activeTab: activeTab,
    questionBlockRefs,
  });
  const autosave = useProfileAutosave({
    userId: initialUser.id,
    payload,
    versionId: initialQuestionnaireVersionId ?? initialSavedQuestionnaire?.currentVersionId,
    initiallyHasDraft: Boolean(initialDraft),
    initialSubmittedAt: initialDashboard.questionnaireSubmittedAt,
    onSaved: attention.onQuestionnaireSaved,
  });
  const savePresentation = combinedSavePresentation(
    profileSavePresentation(
      autosave.error ? "error" : autosave.state,
      autosave.hasSaved,
      autosave.hasDraft,
      autosave.hasUnsavedChanges,
      incompleteTargets.length > 0
    ),
    contactSaveStatus
  );

  return (
    <div
      data-desktop-viewport
      data-profile-reader
      className={`${dcx("app-page-shell v2-page-shell")} ${styles.page}`}
    >
      {vipError && <p role="status" className="ui-form-message">{vipError}</p>}
      <header className={styles.pageHeading}>
        <span className={styles.eyebrow}>让我们更了解你</span>
        <h1>我的资料</h1>
        <p>从日常习惯到心动偏好，慢慢写下真实的你。</p>
      </header>
      <ProfileSaveNotice
        savePresentation={savePresentation}
        error={autosave.error}
        onRetry={autosave.retry}
      />
      <section className={`${dcx("ui-card ui-card--padded")} ${styles.workspace}`}>
        <InteractiveFields>
          <ProfileDesktopDirectory
            readerItems={readerItems}
            activeTab={activeTab}
            currentIndex={currentIndex}
            itemIncomplete={itemIncomplete}
            openQuestion={openQuestion}
          />
          <ProfileModuleTabs activeTab={activeTab} changeModule={changeModule} />
          <div className={styles.readerFrame}>
            <div
              ref={readerRef}
              className={styles.reader}
              role="region"
              aria-label="当前题目"
              onChange={onReaderChange}
            >
              <ProfileReaderToolbar
                activeTab={activeTab}
                currentIndex={currentIndex}
                questionCount={moduleItems.length}
                savePresentation={savePresentation}
                onOpenDirectory={() => directoryRef.current?.showModal()}
              />
              <ProfileSelfSection
                activeTab={activeTab}
                displayName={displayName}
                setDisplayName={setDisplayName}
                hardMatchForm={hardMatchForm}
                setHardMatchForm={setHardMatchForm}
                userId={initialUser.id}
                email={initialUser.email}
                contactPreferences={initialContactPreferences}
                setContactSaveStatus={setContactSaveStatus}
                onContactNavigateBlocked={() => openQuestion("self", 2)}
                lifestyleQuestions={lifestyleQuestions}
                answers={answers}
                setAnswers={setAnswers}
                setAttentionBlockRef={setAttentionBlockRef}
                attentionBlockClassName={attention.attentionBlockClassName}
                renderAttentionNote={attention.renderAttentionNote}
                questionOptions={questionOptions}
              />
              <ProfilePartnerSection
                activeTab={activeTab}
                hardMatchForm={hardMatchForm}
                setHardMatchForm={setHardMatchForm}
                vipActive={vipActive}
                onRequireVip={() => vipDialogRef.current?.showModal()}
                schoolOptions={schoolOptions}
                setAttentionBlockRef={setAttentionBlockRef}
                attentionBlockClassName={attention.attentionBlockClassName}
                renderAttentionNote={attention.renderAttentionNote}
                questionOptions={questionOptions}
              />
              <ProfileValuesSection
                activeTab={activeTab}
                valuesQuestions={valuesQuestions}
                answers={answers}
                setAnswers={setAnswers}
                setAttentionBlockRef={setAttentionBlockRef}
                attentionBlockClassName={attention.attentionBlockClassName}
                renderAttentionNote={attention.renderAttentionNote}
              />
            </div>
            <ReaderScrollHint readerRef={readerRef} question={moduleItems[currentIndex]?.node} />
          </div>
          <ProfileReaderFooter
            incompleteCount={incompleteTargets.length}
            currentIndex={currentIndex}
            activeTab={activeTab}
            previousReaderModule={previousReaderModule}
            nextReaderModule={nextReaderModule}
            lastReaderQuestion={lastReaderQuestion}
            readerItems={readerItems}
            savePresentation={savePresentation}
            completed={completedSnapshot === snapshot}
            onFinish={finishReader}
            openQuestion={openQuestion}
          />
          <ProfileVipDialog vipDialogRef={vipDialogRef} />
          <ProfileDirectoryDialog
            directoryRef={directoryRef}
            readerItems={readerItems}
            activeTab={activeTab}
            currentIndex={currentIndex}
            itemIncomplete={itemIncomplete}
            openQuestion={openQuestion}
          />
        </InteractiveFields>
      </section>
    </div>
  );
}
