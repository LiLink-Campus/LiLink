import { cx } from "../admin-class-names";
import { adminStyles } from "./user-display";
import type { AdminUsersModel } from "./use-admin-users";

export function UserProfile({ model }: { model: AdminUsersModel }) {
  const {
    displayUser,
    effectiveDetailTab,
    pending,
    editing,
    editForm,
    setEditForm,
    startEditing,
    cancelEditing,
    saveEdit,
  } = model;
  if (!displayUser) return null;
  return (
    <>
      {" "}
      {effectiveDetailTab === "profile" && (
        <div className={cx(adminStyles, "admin-fade-panel")}>
          {editing && editForm ? (
            <div className={cx(adminStyles, "admin-page-stack")}>
              <div className={cx(adminStyles, "admin-table-wrap")}>
                <table className={cx(adminStyles, "admin-table")}>
                  <tbody>
                    <tr>
                      <td className={cx(adminStyles, "admin-table-label-wide")}>昵称</td>
                      <td>
                        <input
                          value={editForm.displayName}
                          onChange={(e) =>
                            setEditForm({ ...editForm, displayName: e.target.value })
                          }
                          className={cx(adminStyles, "admin-full-control")}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className={cx(adminStyles, "admin-table-label")}>邮箱</td>
                      <td>
                        <input
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className={cx(adminStyles, "admin-full-control")}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className={cx(adminStyles, "admin-table-label")}>一句话介绍</td>
                      <td>
                        <input
                          value={editForm.headline}
                          onChange={(e) => setEditForm({ ...editForm, headline: e.target.value })}
                          className={cx(adminStyles, "admin-full-control")}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className={cx(adminStyles, "admin-table-label")}>年级</td>
                      <td>
                        <input
                          value={editForm.schoolYear}
                          onChange={(e) => setEditForm({ ...editForm, schoolYear: e.target.value })}
                          className={cx(adminStyles, "admin-full-control")}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className={cx(adminStyles, "admin-table-label")}>项目 / 专业</td>
                      <td>
                        <input
                          value={editForm.programName}
                          onChange={(e) =>
                            setEditForm({ ...editForm, programName: e.target.value })
                          }
                          className={cx(adminStyles, "admin-full-control")}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className={cx(adminStyles, "admin-table-label")}>简介</td>
                      <td>
                        <textarea
                          value={editForm.bio}
                          rows={3}
                          onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                          className={cx(adminStyles, "admin-full-control")}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="auth-actions">
                <button
                  className="ui-button ui-button--primary"
                  type="button"
                  disabled={pending === "edit"}
                  onClick={() => void saveEdit()}
                >
                  {pending === "edit" ? "保存中…" : "保存修改"}
                </button>
                <button
                  className="ui-button ui-button--secondary"
                  type="button"
                  onClick={cancelEditing}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className={cx(adminStyles, "admin-page-stack")}>
              <div className={cx(adminStyles, "admin-table-wrap")}>
                <table className={cx(adminStyles, "admin-table")}>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600, width: "8rem" }}>昵称</td>
                      <td>{displayUser.displayName ?? "—"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>真实姓名</td>
                      <td>{displayUser.profile?.fullName ?? "—"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>一句话介绍</td>
                      <td>{displayUser.profile?.headline ?? "—"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>年级</td>
                      <td>{displayUser.profile?.schoolYear ?? "—"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>项目 / 专业</td>
                      <td>{displayUser.profile?.programName ?? "—"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>简介</td>
                      <td>{displayUser.profile?.bio ?? "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="auth-actions">
                <button
                  className="ui-button ui-button--secondary"
                  type="button"
                  onClick={startEditing}
                  style={{ minHeight: "2rem", padding: "0 0.75rem", fontSize: "0.82rem" }}
                >
                  编辑资料
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
