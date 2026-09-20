"use client";

import { PwaInstallCard } from "../../_components/PwaInstall";
import Link from "next/link";
import { RevealCountdown } from "./RevealCountdown";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import type { Agenda, AgendaItem, AgendaItemAction } from "../_lib/agenda";
import type { WeeklyIntent } from "../../../lib/weekly-intent";
import styles from "./HomeOverview.module.css";

const activities = [
  {
    id: "service",
    label: "LiLink 1v1 · 专人服务",
    title: "想让相遇，更进一步？",
    description: "聊聊你期待的关系，让专人陪你认真寻找。",
    action: "了解一对一服务 ↗",
    image: "/images/campus-clean-romance.webp",
  },
  {
    id: "partner",
    label: "商家合作 · 筹备中",
    title: "下一次见面，多一个去处",
    description: "校园周边的相遇好去处，正在准备中。",
    action: "查看活动说明 ↗",
    image: "/images/campus-couple-anime.webp",
  },
] as const;

export function HomeOverview({
  name,
  counterpartName,
  agenda,
  hasCycle,
  optedIn,
  canEdit,
  eligible,
  intent,
  saving,
  activitiesPaused = false,
  onAction,
}: {
  counterpartName: string | null;
  name: string;
  agenda: Agenda;
  hasCycle: boolean;
  optedIn: boolean;
  canEdit: boolean;
  eligible: boolean;
  intent: WeeklyIntent | null;
  saving: boolean;
  activitiesPaused?: boolean;
  onAction: (id: AgendaItem["id"], action: AgendaItemAction) => void;
}) {
  const [activityIndex, setActivityIndex] = useState(0);
  const [carouselHover, setCarouselHover] = useState(false);
  const [carouselFocus, setCarouselFocus] = useState(false);
  const carouselId = useId();
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [swiping, setSwiping] = useState(false);

  function moveActivity(delta: number) {
    setActivityIndex((index) => (index + delta + activities.length) % activities.length);
  }
  const displayedIntent = intent;
  const matchItem = !hasCycle
    ? agenda.items.find((item) => item.id.startsWith("MATCH"))
    : undefined;
  const hasResult = Boolean(matchItem);
  const [modal, setModal] = useState<"guide" | "partner" | "cancel" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const activityCount = activities.length;
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    function updateTimer() {
      window.clearInterval(timer);
      if (
        activityCount < 2 ||
        carouselHover ||
        carouselFocus ||
        modal ||
        activitiesPaused ||
        swiping ||
        motion.matches ||
        document.hidden
      )
        return;
      timer = window.setInterval(
        () => setActivityIndex((index) => (index + 1) % activityCount),
        5000
      );
    }
    updateTimer();
    motion.addEventListener("change", updateTimer);
    document.addEventListener("visibilitychange", updateTimer);
    return () => {
      window.clearInterval(timer);
      motion.removeEventListener("change", updateTimer);
      document.removeEventListener("visibilitychange", updateTimer);
    };
  }, [
    activityCount,
    carouselHover,
    carouselFocus,
    modal,
    activitiesPaused,
    swiping,
    activityIndex,
  ]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  const participation = agenda.items.find((item) => item.id === "PARTICIPATION");
  const preparation = agenda.items.find(
    (item) => (item.id === "QUESTIONNAIRE" || item.id === "PROFILE_CARD") && item.actionable
  );
  const needsProfile = !eligible && !optedIn;
  const step = optedIn || hasResult ? 2 : needsProfile ? 0 : 1;
  const intentLabel = displayedIntent
    ? { FRIEND: "认识朋友", DATE: "约会", BOTH: "交朋友或约会都可以" }[displayedIntent]
    : "未设置";
  const title = matchItem
    ? matchItem.title
    : !hasCycle
      ? "当前暂无开放的匹配"
      : optedIn
        ? "你已报名本轮匹配"
        : !canEdit
          ? "本轮报名已截止"
          : needsProfile
            ? "先完成资料，再报名匹配"
            : "选择意向，报名本轮匹配";
  const nameOffset = matchItem && counterpartName ? title.indexOf(counterpartName) : -1;
  const description = matchItem
    ? matchItem.subtitle
    : !hasCycle
      ? "新一轮开放后，请回到首页选择意向并报名。"
      : optedIn
        ? `你的匹配意向：${intentLabel}。${canEdit ? "无需重复报名。" : "已进入匹配锁定期，无法更改匹配意向或取消报名。"}`
        : !canEdit
          ? "你未报名本轮匹配，请等待下一轮开放后报名。"
          : needsProfile
            ? "填写匹配资料后，还需回到首页选择本轮意向，才算报名成功。"
            : "请选择认识朋友、约会，或两者都可以。保存意向后即报名成功。";
  const actions: AgendaItemAction[] = matchItem
    ? matchItem.actions
    : !hasCycle || !canEdit
      ? []
      : needsProfile
        ? preparation?.actions.length
          ? preparation.actions
          : [
              {
                kind: "link",
                href: "/dashboard/profile",
                label: "去完成匹配资料",

              },
            ]
        : (participation?.actions ?? []);
  const actionId = needsProfile ? (preparation?.id ?? "QUESTIONNAIRE") : "PARTICIPATION";
  function actionButton(action: AgendaItemAction) {
    const label =
      action.kind === "intent-sheet" ? (optedIn ? "更换匹配意向" : "选择意向并报名") : action.label;
    const className = action.kind === "withdraw" ? styles.secondary : styles.primary;
    return action.kind === "link" ? (
      <Link key={label} className={className} href={action.href ?? "/dashboard/profile"}>
        {label}
      </Link>
    ) : (
      <button
        key={label}
        className={className}
        disabled={saving}
        onClick={() =>
          action.kind === "withdraw" ? setModal("cancel") : onAction(actionId, action)
        }
      >
        {saving ? (action.loadingLabel ?? "保存中…") : label}
      </button>
    );
  }
  return (
    <div className={styles.page}>
      <header className={styles.greeting}>
        <h1>你好，{name}</h1>
        <p>在这里报名每周匹配，查看参与状态和结果。</p>
      </header>
      <div className={styles.top}>
        <section className={styles.task} aria-labelledby="participation-title">
          <p className={styles.status}>
            {hasResult
              ? "结果已公布"
              : optedIn
                ? "报名成功"
                : hasCycle && canEdit
                  ? "尚未报名"
                  : "报名未开放"}
          </p>
          <h2 id="participation-title">
            {nameOffset >= 0 && counterpartName ? (
              <>
                {title.slice(0, nameOffset)}
                <span className={styles.counterpartName}>{counterpartName}</span>
                {title.slice(nameOffset + counterpartName.length)}
              </>
            ) : (
              title
            )}
          </h2>
          <p className={styles.description}>{description}</p>
          {hasCycle && !hasResult && agenda.countdown.state === "upcoming" && (
            <div className={styles.reveal}>
              <span>距离匹配结果公布</span>
              <RevealCountdown
                targetIso={agenda.countdown.revealAt}
                includeSeconds
                expiredLabel="结果公布时间已到"
                className={styles.countdown}
              />
              {optedIn && <p>本轮匹配成功后，结果公布时会向双方发送邮件。</p>}
            </div>
          )}
          {actions.length > 0 && <div className={styles.actions}>{actions.map(actionButton)}</div>}
          {optedIn && !hasResult && <PwaInstallCard />}
        </section>
        <aside
          className={styles.campaign}
          aria-label="活动轮播"
          aria-roledescription="轮播"
          onMouseEnter={() => setCarouselHover(true)}
          onMouseLeave={() => setCarouselHover(false)}
          onFocus={() => setCarouselFocus(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setCarouselFocus(false);
          }}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            swipeStart.current = { x: touch.clientX, y: touch.clientY };
            setSwiping(true);
          }}
          onTouchEnd={(event) => {
            const start = swipeStart.current;
            const touch = event.changedTouches[0];
            if (start && touch) {
              const deltaX = touch.clientX - start.x;
              const deltaY = touch.clientY - start.y;
              if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY))
                moveActivity(deltaX < 0 ? 1 : -1);
            }
            swipeStart.current = null;
            setSwiping(false);
          }}
          onTouchCancel={() => {
            swipeStart.current = null;
            setSwiping(false);
          }}
        >
          <div
            className={styles.carouselTrack}
            style={{ transform: `translateX(-${activityIndex * 100}%)` }}
            aria-live={carouselHover || carouselFocus ? "polite" : "off"}
          >
            {activities.map((activity, index) => (
              <div
                key={activity.id}
                id={`${carouselId}-${activity.id}`}
                role="group"
                aria-roledescription="幻灯片"
                aria-label={`${index + 1} / ${activities.length}：${activity.title}`}
                className={styles.carouselSlide}
                aria-hidden={index !== activityIndex}
                inert={index !== activityIndex}
              >
                <Image
                  src={activity.image}
                  alt="校园活动插画"
                  width={700}
                  height={340}
                  loading={index === 0 ? "eager" : "lazy"}
                  className={styles.campaignImage}
                />
                <div className={styles.campaignCopy}>
                  <span>{activity.label}</span>
                  <h2>{activity.title}</h2>
                  <p>{activity.description}</p>
                  {activity.id === "service" ? <Link className={styles.activityLink} href="/one-to-one">{activity.action}</Link> : <button type="button" onClick={() => setModal(activity.id)}>{activity.action}</button>}
                </div>
              </div>
            ))}
          </div>
          {activities.length > 1 && (
            <div className={styles.carouselControls}>
              <div className={styles.carouselDots}>
                {activities.map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-controls={`${carouselId}-${item.id}`}
                    aria-label={`切换到${item.label}`}
                    aria-pressed={index === activityIndex}
                    onClick={() => setActivityIndex(index)}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
      <section className={styles.guide}>
        <div className={styles.sectionHeading}>
          <h2>如何参加匹配</h2>
          <button onClick={() => setModal("guide")}>第一次来？看参与说明 ↗</button>
        </div>
        <div className={styles.steps}>
          {[
            ["完成匹配资料", "填写生活习惯和相处期待，让我们更了解你。"],
            ["选择意向并报名", "每轮都要确认参加。只填资料，不会自动报名。"],
            ["查看匹配结果", "匹配成功后，双方会收到邮件，也可进入「我的匹配」查看结果。"],
          ].map(([heading, text], index) => (
            <article
              key={heading}
              className={`${styles.step} ${index === step ? styles.current : ""}`}
            >
              <div>
                <span className={styles.number}>{index + 1}</span>
                <h3>{heading}</h3>
                {index === step && (
                  <span className={styles.stepAction}>
                    {index === 0 ? (
                      <Link href="/dashboard/profile">
                        {index < step ? "查看资料" : "去完成"} ↗
                      </Link>
                    ) : index === 1 ? (
                      canEdit && eligible ? (
                        <button
                          disabled={saving}
                          onClick={() =>
                            onAction("PARTICIPATION", {
                              kind: "intent-sheet",
                              label: "选择意向",

                            })
                          }
                        >
                          {optedIn ? "更换意向" : "去报名"} ↗
                        </button>
                      ) : (
                        <small>{!eligible ? "先完成资料" : "报名未开放"}</small>
                      )
                    ) : (
                      <Link href="/dashboard/match">查看匹配 ↗</Link>
                    )}
                  </span>
                )}
              </div>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <dialog
        ref={dialog}
        className={styles.dialog}
        onCancel={() => setModal(null)}
        onClose={() => setModal(null)}
        aria-labelledby="home-dialog-title"
      >
        <button className={styles.close} aria-label="关闭" onClick={() => setModal(null)}>
          ×
        </button>
        {modal === "guide" && (
          <div className={styles.guideContent}>
            <h2 id="home-dialog-title">如何参加匹配</h2>
            <p className={styles.guideIntro}>完成这三步，开始认识新同学。</p>
            <ol className={styles.guideSteps}>
              <li>
                <span>1</span>
                <div>
                  <h3>填写资料</h3>
                  <p>进入「我的资料」，完成匹配所需的信息。</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <h3>确认本轮报名</h3>
                  <p>
                    回到首页，选择匹配意向并保存。
                    <br />
                    看到「报名成功」，就报好了。
                  </p>
                  <p className={styles.guideHighlight}>每轮都要确认报名，填完资料不会自动参加。</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <h3>查看匹配结果</h3>
                  <p>
                    如果本轮匹配成功，结果公布时会自动向双方发送邮件。你也可以进入「我的匹配」查看结果。
                  </p>
                </div>
              </li>
            </ol>
            <div className={styles.guideNotes}>
              <h3 className={styles.tipsTitle}>Tips</h3>
              <p>进入匹配锁定期前，可以更换意向或取消报名。</p>
              <p>本轮也可能暂未匹配到合适的同学。</p>
            </div>
            <button className={styles.primary} onClick={() => setModal(null)}>
              我知道了
            </button>
          </div>
        )}

        {modal === "partner" && (
          <>
            <h2 id="home-dialog-title">商家合作活动</h2>
            <p>商家合作活动正在筹备，开放后会公布活动时间、优惠内容和参与方式。</p>
            <button type="button" className={styles.primary} onClick={() => setModal(null)}>
              知道了
            </button>
          </>
        )}
        {modal === "cancel" && (
          <>
            <h2 id="home-dialog-title">取消本轮报名？</h2>
            <p>取消后将不参加本轮匹配。报名截止前，你还可以重新选择意向报名。</p>
            <button
              className={styles.primary}
              disabled={saving}
              onClick={() => {
                const action = participation?.actions.find((item) => item.kind === "withdraw");
                if (action) onAction("PARTICIPATION", action);
                setModal(null);
              }}
            >
              确认取消报名
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}
