import { cx } from "../admin-class-names";
import { adminStyles, HARD_MATCH_LABELS, formatAnswer } from "./user-display";
import type { AdminUsersModel } from "./use-admin-users";

export function UserHistory({ model }: { model: AdminUsersModel }) {
  const {
    questionnaireLoading,
    participationsLoading,
    schoolNameById,
    displayUser,
    effectiveDetailTab,
    answerGroups,
    participationsData,
  } = model;
  if (!displayUser) return null;
  return (
    <>
      {" "}
      {effectiveDetailTab === "questionnaire" && (
        <div style={{ animation: "fadeIn 0.2s ease" }}>
          {answerGroups ? (
            <div className={cx(adminStyles, "admin-page-stack")}>
              {/* Hard-match answers */}
              {answerGroups.hardMatch.length > 0 && (
                <>
                  <h3 style={{ margin: 0 }}>硬性条件</h3>
                  <div className={cx(adminStyles, "admin-table-wrap")}>
                    <table className={cx(adminStyles, "admin-table")}>
                      <thead>
                        <tr>
                          <th>项目</th>
                          <th>回答</th>
                        </tr>
                      </thead>
                      <tbody>
                        {answerGroups.hardMatch.map(([key, value]) => (
                          <tr key={key}>
                            <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                              {HARD_MATCH_LABELS[key] ?? key}
                            </td>
                            <td>{formatAnswer(key, value, schoolNameById)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Dynamic questionnaire answers */}
              {answerGroups.questionnaire.length > 0 && (
                <>
                  <h3 style={{ margin: 0 }}>价值观问卷</h3>
                  <div className={cx(adminStyles, "admin-table-wrap")}>
                    <table className={cx(adminStyles, "admin-table")}>
                      <thead>
                        <tr>
                          <th>题目 Key</th>
                          <th>回答</th>
                        </tr>
                      </thead>
                      <tbody>
                        {answerGroups.questionnaire.map(([key, value]) => (
                          <tr key={key}>
                            <td style={{ fontWeight: 500 }}>{key}</td>
                            <td>{formatAnswer(key, value, schoolNameById)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : questionnaireLoading ? (
            <div className={cx(adminStyles, "admin-empty-state")}>正在加载问卷详情…</div>
          ) : !displayUser.questionnaireResponse?.submittedAt ? (
            <div className={cx(adminStyles, "admin-empty-state")}>该用户还没有提交问卷。</div>
          ) : (
            <div className={cx(adminStyles, "admin-empty-state")}>
              问卷答案暂时无法显示，请稍后重试。
            </div>
          )}
        </div>
      )}
      {/* ── Tab: Cycles ─── */}
      {effectiveDetailTab === "cycles" && (
        <div style={{ animation: "fadeIn 0.2s ease" }}>
          {participationsLoading ? (
            <div className={cx(adminStyles, "admin-empty-state")}>正在加载轮次参与记录…</div>
          ) : participationsData && participationsData.items.length > 0 ? (
            <div className={cx(adminStyles, "admin-table-wrap")}>
              <table className={cx(adminStyles, "admin-table")}>
                <thead>
                  <tr>
                    <th>轮次 ID</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {participationsData.items.map((p) => (
                    <tr key={p.cycleId}>
                      <td style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>{p.cycleId}</td>
                      <td>
                        <span className="ui-badge ui-badge--neutral">
                          {p.status === "OPTED_IN" ? "已参加" : "未参加"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={cx(adminStyles, "admin-empty-state")}>暂无轮次参与记录。</div>
          )}
        </div>
      )}
    </>
  );
}
