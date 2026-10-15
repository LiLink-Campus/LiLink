import { cx } from "../admin-class-names";
import { adminStyles } from "./user-display";
import type { AdminUsersModel } from "./use-admin-users";

export function UserHistory({ model }: { model: AdminUsersModel }) {
  const {
    questionnaireLoading,
    participationsLoading,
    displayUser,
    effectiveDetailTab,
    answerGroups,
    participationsData,
  } = model;
  if (!displayUser) return null;
  return (
    <>
      {" "}
      {(["self", "partner", "values"] as const).some((tab) => tab === effectiveDetailTab) && (
        <section
          aria-label={
            { self: "关于你", partner: "希望遇见谁", values: "价值观" }[
              effectiveDetailTab as "self" | "partner" | "values"
            ]
          }
        >
          <h3>
            {
              { self: "关于你", partner: "希望遇见谁", values: "价值观" }[
                effectiveDetailTab as "self" | "partner" | "values"
              ]
            }
          </h3>
          {questionnaireLoading ? (
            <p role="status">正在加载资料…</p>
          ) : answerGroups ? (
            answerGroups[effectiveDetailTab as "self" | "partner" | "values"].length ? (
              <div className={cx(adminStyles, "admin-table-wrap")}>
                <table className={cx(adminStyles, "admin-table")}>
                  <thead>
                    <tr>
                      <th scope="col">项目</th>
                      <th scope="col">回答</th>
                    </tr>
                  </thead>
                  <tbody>
                    {answerGroups[effectiveDetailTab as "self" | "partner" | "values"].map(
                      (row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>{row.answer}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>暂无当前资料回答。</p>
            )
          ) : (
            <p>
              {displayUser.questionnaireResponse?.submittedAt
                ? "资料暂时无法显示，请稍后重试。"
                : "该用户还没有提交问卷。"}
            </p>
          )}
        </section>
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
