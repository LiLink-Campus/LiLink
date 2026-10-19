"use client";
import { AdminPagination } from "../admin-pagination";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import styles from "./cycles.module.css";
import { formatChinaStandardDateTime } from "@/lib/china-standard-time";
import type { CyclesController } from "./use-cycles";
const adminStyles = [commonStyles];

export function CycleResults({ model }: { model: CyclesController }) {
  const { selectedCycleId, resultTab, setResultTab, matchesData, cyclePreview, matchesLoading, pending, pairPage, setPairPage, expandedMatchId, setExpandedMatchId, selectedCycle, runCycle, previewCycle, setMatchPage, PAGE_SIZE_PAIRS } = model;
  if (!selectedCycle) return null;
  return (
          <section className={styles.panel} aria-labelledby="cycle-results-title">
            <div className={styles.sectionHead}>
              <div>
                <h2 id="cycle-results-title">匹配结果</h2>
                <p>预演用于检查建议组合，最终展示已生成的正式匹配。</p>
              </div>
            </div>
            <div className={styles.resultToolbar}>
              <div className={styles.resultTabs} role="tablist" aria-label="匹配结果类型">
                <button
                  id="preview-tab"
                  role="tab"
                  aria-selected={resultTab === "preview"}
                  aria-controls="preview-results"
                  type="button"
                  onClick={() => setResultTab("preview")}
                >
                  预演
                </button>
                <button
                  id="final-tab"
                  role="tab"
                  aria-selected={resultTab === "final"}
                  aria-controls="final-results"
                  type="button"
                  onClick={() => setResultTab("final")}
                >
                  最终
                </button>
              </div>
              {resultTab === "preview" ? (
                <button
                  className="ui-button ui-button--secondary"
                  type="button"
                  disabled={!!pending}
                  onClick={() => void previewCycle()}
                >
                  {pending === "preview" ? "预演中…" : cyclePreview ? "重新预演" : "生成预演"}
                </button>
              ) : (
                <div className="auth-actions">
                  <button
                    className="ui-button ui-button--primary"
                    type="button"
                    disabled={!!pending}
                    onClick={() => void runCycle(false)}
                  >
                    {pending === "run" ? "执行中…" : "正式执行"}
                  </button>
                  <button
                    className="ui-button ui-button--secondary"
                    type="button"
                    disabled={!!pending}
                    aria-describedby="force-run-description"
                    onClick={() => void runCycle(true)}
                  >
                    {pending === "force-run" ? "强制中…" : "强制重新执行"}
                  </button>
                </div>
              )}
            </div>
            {resultTab === "preview" ? (
              <div role="tabpanel" id="preview-results" aria-labelledby="preview-tab">
                {pending === "preview" ? (
                  <p className={styles.empty}>正在生成预演…</p>
                ) : (
                  <>
                    {cyclePreview?.cycleId === selectedCycleId ? (
                      (() => {
                        const allP = cyclePreview.suggestedPairs;
                        const pTotalPages = Math.max(1, Math.ceil(allP.length / PAGE_SIZE_PAIRS));
                        const pSafePage = Math.min(pairPage, pTotalPages);
                        const pStart = (pSafePage - 1) * PAGE_SIZE_PAIRS;
                        const visibleP = allP.slice(pStart, pStart + PAGE_SIZE_PAIRS);

                        return (
                          <div className={cx(adminStyles, "admin-page-stack")}>
                            <div className={styles.resultNote}>
                              <time dateTime={cyclePreview.generatedAt}>
                                生成于{" "}
                                {formatChinaStandardDateTime(cyclePreview.generatedAt, {
                                  dateStyle: "short",
                                  timeStyle: "medium",
                                })}
                                （北京时间）
                              </time>
                              <span>
                                建议 {allP.length} 组 · 未匹配{" "}
                                {cyclePreview.unmatchedUserIds.length} 人
                              </span>
                              <span>预演反映生成时的数据，最终结果以正式执行为准。</span>
                            </div>
                            <div className={cx(adminStyles, "admin-record-list")}>
                              {visibleP.map((pair) => (
                                <div
                                  key={`${pair.leftUserId}-${pair.rightUserId}`}
                                  className={cx(adminStyles, "admin-record-item")}
                                >
                                  <div className={cx(adminStyles, "admin-record-topline")}>
                                    <strong>
                                      {pair.leftDisplayName ?? pair.leftUserId} ×{" "}
                                      {pair.rightDisplayName ?? pair.rightUserId}
                                    </strong>
                                    <span className="ui-badge ui-badge--neutral">
                                      分数 {pair.score.toFixed(1)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {allP.length === 0 && (
                                <div className={cx(adminStyles, "admin-empty-state")}>
                                  当前没有建议匹配。
                                </div>
                              )}
                            </div>

                            {pTotalPages > 1 && (
                              <AdminPagination
                                className={cx(adminStyles, "admin-pagination")}
                                page={pSafePage}
                                totalPages={pTotalPages}
                                total={allP.length}
                                unit="组"
                                onPageChange={setPairPage}
                              />
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className={cx(adminStyles, "admin-empty-state")}>
                        点击「生成预演」查看建议组合，不会生成正式匹配。
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div role="tabpanel" id="final-results" aria-labelledby="final-tab">
                <p id="force-run-description" className={styles.finalNotice}>
                  强制重新执行会删除本轮已有匹配并重新生成。
                </p>
                {selectedCycle.status !== "REVEALED" && (
                  <p className={styles.finalNotice}>
                    正式匹配即使已生成，也将在轮次揭晓后向用户显示。
                  </p>
                )}
                {matchesLoading ? (
                  <div className={cx(adminStyles, "admin-empty-state")}>正在加载匹配结果...</div>
                ) : matchesData && matchesData.items.length > 0 ? (
                  <>
                    <div className={cx(adminStyles, "admin-record-list")}>
                      {matchesData.items.map((match) => {
                        const isExpanded = expandedMatchId === match.id;
                        const meetupFeedback = match.meetupFeedback ?? [];

                        return (
                          <div key={match.id} className={cx(adminStyles, "admin-record-item")}>
                            <div className={cx(adminStyles, "admin-record-topline")}>
                              <strong>
                                {match.participants
                                  .map((p) => p.user.displayName ?? p.user.email)
                                  .join(" × ")}
                              </strong>
                              <span className="ui-badge ui-badge--neutral">
                                分数 {match.score.toFixed(1)}
                              </span>
                            </div>
                            <div className={cx(adminStyles, "admin-inline-meta")}>
                              <span>
                                揭晓：
                                {match.revealedAt
                                  ? formatChinaStandardDateTime(match.revealedAt)
                                  : "待揭晓"}
                              </span>
                              <span>
                                引荐：
                                {match.introducedAt
                                  ? formatChinaStandardDateTime(match.introducedAt)
                                  : "未引荐"}
                              </span>
                              <span>举报数：{match.reports.length}</span>
                              <span>旧匹配反馈：{match.feedback.length}</span>
                              <span>会后反馈：{meetupFeedback.length}</span>
                            </div>
                            <div className="auth-actions" style={{ marginTop: "0.75rem" }}>
                              <button
                                className="ui-button ui-button--secondary"
                                type="button"
                                onClick={() => setExpandedMatchId(isExpanded ? null : match.id)}
                              >
                                {isExpanded ? "收起反馈" : "查看反馈"}
                              </button>
                            </div>
                            {isExpanded ? (
                              <div style={{ marginTop: "0.75rem" }}>
                                <h4>旧匹配反馈</h4>
                                {match.feedback.length > 0 ? (
                                  <ul className={cx(adminStyles, "admin-reason-list")}>
                                    {match.feedback.map((fb) => {
                                      const author = match.participants.find(
                                        (p) => p.userId === fb.authorUserId
                                      );
                                      const authorName =
                                        author?.user.displayName ??
                                        author?.user.email ??
                                        fb.authorUserId;
                                      return (
                                        <li key={fb.id}>
                                          {authorName} 评分 {fb.rating}/5
                                          {fb.comment ? `：${fb.comment}` : ""}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <p style={{ margin: "0.5rem 0 0" }}>暂无旧匹配反馈。</p>
                                )}
                                <h4 style={{ marginTop: "0.9rem" }}>会后反馈</h4>
                                {meetupFeedback.length > 0 ? (
                                  <ul className={cx(adminStyles, "admin-reason-list")}>
                                    {meetupFeedback.map((fb) => {
                                      const author = match.participants.find(
                                        (p) => p.userId === fb.authorUserId
                                      );
                                      const authorName =
                                        author?.user.displayName ??
                                        author?.user.email ??
                                        fb.authorUserId;
                                      const subject = match.participants.find(
                                        (p) => p.userId === fb.subjectUserId
                                      );
                                      const subjectName =
                                        subject?.user.displayName ??
                                        subject?.user.email ??
                                        fb.subjectUserId;
                                      const tags = [...fb.positiveTags, ...fb.issueTags];
                                      return (
                                        <li key={fb.id}>
                                          {authorName} → {subjectName}：契合 {fb.personalFitScore}
                                          /5， 互动 {fb.interactionQualityScore}/5， 边界{" "}
                                          {fb.safetyBoundaryLevel}
                                          {tags.length > 0 ? `；标签：${tags.join("、")}` : ""}
                                          {fb.note ? `；说明：${fb.note}` : ""}
                                          ；创建 {formatChinaStandardDateTime(fb.createdAt)}
                                          ；更新 {formatChinaStandardDateTime(fb.updatedAt)}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <p style={{ margin: "0.5rem 0 0" }}>暂无会后反馈。</p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {matchesData.totalPages > 1 && (
                      <AdminPagination
                        className={cx(adminStyles, "admin-pagination")}
                        page={matchesData.page}
                        totalPages={matchesData.totalPages}
                        total={matchesData.total}
                        unit="组"
                        onPageChange={setMatchPage}
                      />
                    )}
                  </>
                ) : (
                  <div className={cx(adminStyles, "admin-empty-state")}>
                    当前轮次还没有生成匹配。
                  </div>
                )}
              </div>
            )}
          </section>

  );
}
