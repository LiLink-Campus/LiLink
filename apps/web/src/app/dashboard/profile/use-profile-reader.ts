import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { HARD_MATCH_KEYS } from "@lilink/shared";
import type { ValuePickerOption } from "../_components/ValuePicker";
import {
  profileAttentionElementId,
  profileAttentionKeyFromHash,
  profileAttentionTabForKey,
} from "../_lib/profile-attention";
import type { Question, SavedQuestionnairePayload } from "../_lib/types";
import { PROFILE_TABS, type ProfileTab } from "./profile-field-state";
import type { ProfileFieldRegistry } from "./use-profile-field-registry";
import styles from "./profile-redesign.module.css";
export function initialProfileTab(
  questions: Question[],
  savedQuestionnaire: SavedQuestionnairePayload
): ProfileTab {
  const firstPendingKey = savedQuestionnaire?.attention?.pendingKeys?.[0];
  if (!firstPendingKey) {
    return "self";
  }

  return profileAttentionTabForKey(firstPendingKey, questions) ?? "self";
}

export function useProfileReader({
  initialTab,
  questions,
  valuesQuestions,
  vipActive,
  questionBlockRefs,
  incompleteTargets,
  snapshot,
}: {
  initialTab: ProfileTab;
  questions: Question[];
  valuesQuestions: Question[];
  vipActive: boolean;
  questionBlockRefs: ProfileFieldRegistry["questionBlockRefs"];
  incompleteTargets: { key: string; tab: ProfileTab }[];
  snapshot: string;
}) {
  const [activeTab, setActiveTab] = useState<ProfileTab>(() => initialTab);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionAnimations = useRef<Animation[]>([]);
  const cancelQuestionTransition = useCallback(() => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = null;
    questionAnimations.current.forEach((animation) => animation.cancel());
    questionAnimations.current = [];
  }, []);
  const [pendingIncompleteKey, setPendingIncompleteKey] = useState<{ key: string } | null>(null);
  function locateIncomplete() {
    const target = incompleteTargets[0];
    if (!target) return;
    const index = readerItems
      .filter((item) => item.tab === target.tab)
      .findIndex((item) => item.elementIds.has(profileAttentionElementId(target.key)));
    openQuestion(target.tab, Math.max(0, index));
    setPendingIncompleteKey({ key: target.key });
  }
  useEffect(() => {
    if (!pendingIncompleteKey) return;
    const target =
      questionBlockRefs.current.get(pendingIncompleteKey.key) ??
      document.getElementById(profileAttentionElementId(pendingIncompleteKey.key));
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "instant" });
      target.classList.add(styles.incompleteFocus);
      target
        .querySelector<HTMLElement>("input, textarea, select, button")
        ?.focus({ preventScroll: true });
    }
    const timer = window.setTimeout(() => target?.classList.remove(styles.incompleteFocus), 2500);
    return () => {
      window.clearTimeout(timer);
      target?.classList.remove(styles.incompleteFocus);
    };
  }, [pendingIncompleteKey, activeTab, questionBlockRefs]);
  const [completedSnapshot, setCompletedSnapshot] = useState<string | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const directoryRef = useRef<HTMLDialogElement>(null);
  const [readerItems, setReaderItems] = useState<
    { node: HTMLElement; tab: ProfileTab; title: string; elementIds: Set<string> }[]
  >([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const previousReaderSelection = useRef<string | null>(null);
  const moduleItems = readerItems.filter((item) => item.tab === activeTab);
  const currentIndex = Math.min(questionIndex, Math.max(0, moduleItems.length - 1));
  const previousReaderModule =
    PROFILE_TABS[PROFILE_TABS.findIndex((tab) => tab.id === activeTab) - 1];
  const nextReaderModule = PROFILE_TABS[PROFILE_TABS.findIndex((tab) => tab.id === activeTab) + 1];
  const lastReaderQuestion = currentIndex >= moduleItems.length - 1;
  function finishReader() {
    if (incompleteTargets.length) locateIncomplete();
    else setCompletedSnapshot(snapshot);
  }
  function changeModule(id: ProfileTab) {
    cancelQuestionTransition();
    setQuestionIndex(0);
    setActiveTab(id);
  }
  useLayoutEffect(() => {
    cancelQuestionTransition();
    const root = readerRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reader-item]")).map(
      (node) => ({
        node,
        elementIds: new Set([
          node.id,
          ...Array.from(node.querySelectorAll("[id]"), (element) => element.id),
        ]),
        tab: node.closest<HTMLElement>("[data-reader-module]")!.dataset.readerModule as ProfileTab,
        title:
          node.getAttribute("data-reader-title") ||
          node.getAttribute("aria-label") ||
          node.querySelector("legend, h2")?.textContent?.trim() ||
          "资料",
      })
    );
    setReaderItems(items);
  }, [vipActive, questions, cancelQuestionTransition]);
  useLayoutEffect(() => {
    for (const item of readerItems) {
      item.node.setAttribute("data-reader-hidden", String(item !== moduleItems[currentIndex]));
    }
    if (!moduleItems[currentIndex]) return;
    const selection = `${activeTab}:${currentIndex}`;
    if (previousReaderSelection.current !== selection && readerRef.current) {
      readerRef.current.scrollTop = 0;
    }
    previousReaderSelection.current = selection;
  }, [readerItems, moduleItems, currentIndex, activeTab]);
  useEffect(() => cancelQuestionTransition, [cancelQuestionTransition]);
  function openQuestion(tab: ProfileTab, index: number, animate = false) {
    cancelQuestionTransition();
    const leaving = moduleItems[currentIndex]?.node;
    const arriving = readerItems.filter((item) => item.tab === tab)[index]?.node;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (leaving && arriving && leaving !== arriving && animate && !reduced) {
      const departure = leaving.animate(
        [
          { transform: "translateX(0)", opacity: 1 },
          { transform: "translateX(-40px)", opacity: 0 },
        ],
        { duration: 160, easing: "ease-in", fill: "forwards" }
      );
      questionAnimations.current = [departure];
      autoAdvanceTimer.current = setTimeout(() => {
        autoAdvanceTimer.current = null;
        departure.cancel();
        setActiveTab(tab);
        setQuestionIndex(index);
        questionAnimations.current = [
          arriving.animate(
            [
              { transform: "translateX(48px)", opacity: 0 },
              { transform: "translateX(0)", opacity: 1 },
            ],
            { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" }
          ),
        ];
        if (readerRef.current) readerRef.current.scrollTop = 0;
      }, 160);
    } else {
      setActiveTab(tab);
      setQuestionIndex(index);
    }
    directoryRef.current?.close();
    if (!animate && readerRef.current) readerRef.current.scrollTop = 0;
  }
  function questionOptions(fieldId: string, options: ValuePickerOption[], value: string) {
    if (moduleItems[currentIndex]?.elementIds.has(fieldId)) return options;
    return options.filter((option) => option.value === value);
  }
  function itemIncomplete(item: (typeof readerItems)[number]) {
    return incompleteTargets.some((target) =>
      item.elementIds.has(profileAttentionElementId(target.key))
    );
  }

  useEffect(() => {
    let timeoutId: number | undefined;
    function locateAttentionHash() {
      window.clearTimeout(timeoutId);
      const attentionHash = window.location.hash;
      const key = profileAttentionKeyFromHash(attentionHash);
      if (!key) {
        return;
      }

      const targetTab =
        key === HARD_MATCH_KEYS.oneLinerIntro ? "self" : profileAttentionTabForKey(key, questions);
      if (!targetTab) {
        return;
      }

      cancelQuestionTransition();
      if (activeTab !== targetTab) {
        setActiveTab(targetTab);
        return;
      }

      timeoutId = window.setTimeout(() => {
        const target =
          questionBlockRefs.current.get(key) ??
          document.getElementById(profileAttentionElementId(key));
        const item = target?.closest<HTMLElement>("[data-reader-item]");
        const readerModule = item?.closest("[data-reader-module]");
        if (item && readerModule) {
          cancelQuestionTransition();
          setQuestionIndex(
            Array.from(readerModule.querySelectorAll("[data-reader-item]")).indexOf(item)
          );
        }
        target?.scrollIntoView({ block: "center" });

        if (target && window.location.hash === attentionHash) {
          window.history.replaceState(
            window.history.state,
            "",
            `${window.location.pathname}${window.location.search}`
          );
        }
      }, 0);
    }

    locateAttentionHash();
    window.addEventListener("hashchange", locateAttentionHash);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("hashchange", locateAttentionHash);
    };
  }, [activeTab, questions, questionBlockRefs, cancelQuestionTransition]);

  function onReaderChange(event: ChangeEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.closest("[data-choice-layout]")) return;
    cancelQuestionTransition();
    if (target.type === "checkbox") {
      const question = valuesQuestions.find((item) => item.key === target.name);
      const selectedCount = target
        .closest("fieldset")
        ?.querySelectorAll('input[type="checkbox"]:checked').length;
      if (!question?.selectionLimit || selectedCount !== question.selectionLimit) return;
    } else if (target.type !== "radio") return;
    autoAdvanceTimer.current = setTimeout(() => {
      if (!lastReaderQuestion) openQuestion(activeTab, currentIndex + 1, true);
      else if (nextReaderModule) openQuestion(nextReaderModule.id, 0, true);
    }, 300);
  }
  return {
    activeTab,
    readerRef,
    directoryRef,
    readerItems,
    moduleItems,
    currentIndex,
    previousReaderModule,
    nextReaderModule,
    lastReaderQuestion,
    completedSnapshot,
    changeModule,
    openQuestion,
    questionOptions,
    itemIncomplete,
    finishReader,
    onReaderChange,
  };
}
export type ProfileReaderItem = ReturnType<typeof useProfileReader>["readerItems"][number];
