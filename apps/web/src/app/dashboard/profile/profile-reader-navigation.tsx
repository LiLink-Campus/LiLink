import type { RefObject } from "react";
import { PROFILE_TABS, type ProfileTab } from "./profile-field-state";
import type { ProfileReaderItem } from "./use-profile-reader";
import { ProfileCompactSaveStatus, type ProfileSavePresentation } from "./profile-save-notice";
import { dcx } from "../_lib/dashboard-class-names";
import styles from "./profile-redesign.module.css";

type DirectoryProps = {
  readerItems: ProfileReaderItem[];
  activeTab: ProfileTab;
  currentIndex: number;
  itemIncomplete: (item: ProfileReaderItem) => boolean;
  openQuestion: (tab: ProfileTab, index: number) => void;
};
function ProfileDirectoryItems({
  readerItems,
  activeTab,
  currentIndex,
  itemIncomplete,
  openQuestion,
}: DirectoryProps) {
  return (
    <>
      {PROFILE_TABS.map((tab) => {
        const items = readerItems.filter((item) => item.tab === tab.id);
        return (
          <section key={tab.id}>
            <h3>
              {tab.label}
              <small>
                {items.filter((item) => !itemIncomplete(item)).length} / {items.length}
              </small>
            </h3>
            <div className={styles.numberGrid}>
              {items.map((item, index) => (
                <button
                  type="button"
                  key={index}
                  aria-label={`${tab.label}第 ${index + 1} 题：${item.title}`}
                  aria-current={activeTab === tab.id && currentIndex === index ? "step" : undefined}
                  data-complete={!itemIncomplete(item)}
                  onClick={() => openQuestion(tab.id, index)}
                >
                  {String(index + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
export function ProfileDesktopDirectory(props: DirectoryProps) {
  return (
    <aside className={styles.desktopDirectory} aria-label="桌面题目目录">
      <h2>题目目录</h2>
      <p>按模块查看，点击题号跳转</p>
      <div className={styles.directoryLegend}>
        <span>● 已答</span>
        <span>○ 未答</span>
        <span>◎ 当前</span>
      </div>
      <ProfileDirectoryItems {...props} />
    </aside>
  );
}
export function ProfileDirectoryDialog({
  directoryRef,
  ...props
}: DirectoryProps & { directoryRef: RefObject<HTMLDialogElement | null> }) {
  return (
    <dialog
      ref={directoryRef}
      className={styles.directory}
      aria-labelledby="question-directory-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) directoryRef.current?.close();
      }}
    >
      <div className={styles.directoryHeader}>
        <h2 id="question-directory-title">题目目录</h2>
        <button
          type="button"
          aria-label="关闭题目目录"
          onClick={() => directoryRef.current?.close()}
        >
          ×
        </button>
      </div>
      <p>按模块查看，点击题号跳转</p>
      <div className={styles.directoryLegend}>
        <span>● 已答</span>
        <span>○ 未答</span>
        <span>◎ 当前</span>
      </div>
      <div className={styles.directoryBody}>
        <ProfileDirectoryItems {...props} />
      </div>
    </dialog>
  );
}
export function ProfileModuleTabs({
  activeTab,
  changeModule,
}: {
  activeTab: ProfileTab;
  changeModule: (tab: ProfileTab) => void;
}) {
  return (
    <nav aria-label="问卷分组" className={`${dcx("app-section-tabs")} ${styles.moduleTabs}`}>
      {PROFILE_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={
            tab.id === activeTab ? dcx("app-section-tab is-active") : dcx("app-section-tab")
          }
          aria-pressed={tab.id === activeTab}
          onClick={() => changeModule(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
export function ProfileReaderToolbar({
  activeTab,
  currentIndex,
  questionCount,
  savePresentation,
  onOpenDirectory,
}: {
  activeTab: ProfileTab;
  currentIndex: number;
  questionCount: number;
  savePresentation: ProfileSavePresentation;
  onOpenDirectory: () => void;
}) {
  return (
    <div className={styles.readerToolbar}>
      <span className={styles.questionCounter}>
        <span className={styles.desktopOnly}>
          {PROFILE_TABS.find((tab) => tab.id === activeTab)?.label} ·{" "}
        </span>
        {currentIndex + 1} / {questionCount}
      </span>
      <ProfileCompactSaveStatus savePresentation={savePresentation} />
      <progress
        className={styles.desktopProgress}
        aria-label="当前模块进度"
        max={Math.max(1, questionCount)}
        value={currentIndex + 1}
      />
      <button type="button" onClick={onOpenDirectory} aria-label="题目目录">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M9 5h12M9 12h12M9 19h12"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="3" cy="5" r="1.5" fill="currentColor" />
          <circle cx="3" cy="12" r="1.5" fill="currentColor" />
          <circle cx="3" cy="19" r="1.5" fill="currentColor" />
        </svg>
        <span>
          <span className={styles.desktopOnly}>题目</span>目录
        </span>
      </button>
    </div>
  );
}
export function ProfileReaderFooter({
  incompleteCount,
  currentIndex,
  activeTab,
  previousReaderModule,
  nextReaderModule,
  lastReaderQuestion,
  readerItems,
  savePresentation,
  completed,
  onFinish,
  openQuestion,
}: {
  incompleteCount: number;
  currentIndex: number;
  activeTab: ProfileTab;
  previousReaderModule: { id: ProfileTab; label: string } | undefined;
  nextReaderModule: { id: ProfileTab; label: string } | undefined;
  lastReaderQuestion: boolean;
  readerItems: ProfileReaderItem[];
  savePresentation: ProfileSavePresentation;
  completed: boolean;
  onFinish: () => void;
  openQuestion: (tab: ProfileTab, index: number) => void;
}) {
  return (
    <footer className={styles.moduleFooter}>
      <div className={styles.readerProgress}>
        <span>{incompleteCount ? `还有 ${incompleteCount} 题待完善` : "必答项已完成"}</span>
        <button type="button" onClick={onFinish}>
          {incompleteCount ? "去补全 →" : "完成问卷"}
        </button>
      </div>
      <div className={styles.moduleActions}>
        <button
          className={styles.previousModule}
          type="button"
          disabled={currentIndex === 0 && !previousReaderModule}
          onClick={() =>
            currentIndex > 0
              ? openQuestion(activeTab, currentIndex - 1)
              : previousReaderModule &&
                openQuestion(
                  previousReaderModule.id,
                  Math.max(
                    0,
                    readerItems.filter((item) => item.tab === previousReaderModule.id).length - 1
                  )
                )
          }
        >
          {currentIndex === 0 && previousReaderModule ? "← 上一模块" : "← 上一题"}
        </button>
        <button className={styles.desktopComplete} type="button" onClick={onFinish}>
          {incompleteCount ? "去补全" : "完成问卷"}
        </button>
        <button
          className={styles.nextModule}
          type="button"
          disabled={
            lastReaderQuestion &&
            !nextReaderModule &&
            !incompleteCount &&
            savePresentation.tone !== "saved"
          }
          onClick={() =>
            !lastReaderQuestion
              ? openQuestion(activeTab, currentIndex + 1)
              : nextReaderModule
                ? openQuestion(nextReaderModule.id, 0)
                : onFinish()
          }
        >
          {!lastReaderQuestion
            ? "下一题 →"
            : nextReaderModule
              ? "下一模块 →"
              : incompleteCount
                ? `补全 ${incompleteCount} 题 →`
                : "完成"}
        </button>
      </div>
      {completed && savePresentation.tone === "saved" ? (
        <p className={styles.completionSuccess} role="status">
          保存成功，问卷已填写完成。
        </p>
      ) : null}
    </footer>
  );
}
