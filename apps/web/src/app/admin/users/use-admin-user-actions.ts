import { FormEvent, useEffect, useRef, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { USER_STATUS_ACTIONS, EditForm, buildEditForm } from "./user-display";
import type { useAdminUsersList } from "./use-admin-users-list";
import type { useAdminUserDetail } from "./use-admin-user-detail";

export function useAdminUserActions(
  list: ReturnType<typeof useAdminUsersList>,
  detail: ReturnType<typeof useAdminUserDetail>,
  setActionError: (error: string | null) => void,
  setActionMessage: (message: string | null) => void
) {
  const { selectedUserId, selectedUser, setSelectedUserId, refresh } = list;
  const { displayUser, reloadUserDetail } = detail;
  const selection = useRef(0);
  const [pending, setPending] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);

  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const [editingReferralLimit, setEditingReferralLimit] = useState(false);

  const [referralLimitDraft, setReferralLimitDraft] = useState("");

  const statusAction = displayUser ? USER_STATUS_ACTIONS[displayUser.status] : null;

  function startEditing() {
    if (!selectedUser) return;
    setEditForm(buildEditForm(selectedUser));
    setEditing(true);
    setActionError(null);
    setActionMessage(null);
  }

  function cancelEditing() {
    setEditing(false);
    setEditForm(null);
    setActionError(null);
  }

  function startEditingReferralLimit() {
    if (!displayUser) return;
    setReferralLimitDraft(String(displayUser.nonEduReferralLimit));
    setEditingReferralLimit(true);
    setActionError(null);
    setActionMessage(null);
  }

  function cancelEditingReferralLimit() {
    setEditingReferralLimit(false);
    setReferralLimitDraft("");
    setActionError(null);
  }

  async function saveEdit() {
    if (!selectedUser || !editForm) return;
    const owner = selection.current;
    setPending("edit");
    setActionError(null);
    setActionMessage(null);
    try {
      const payload: Record<string, unknown> = {};
      if (editForm.displayName !== (selectedUser.displayName ?? ""))
        payload.displayName = editForm.displayName || null;
      if (editForm.email !== selectedUser.email) payload.email = editForm.email;
      if (editForm.headline !== (selectedUser.profile?.headline ?? ""))
        payload.headline = editForm.headline || null;
      if (editForm.schoolYear !== (selectedUser.profile?.schoolYear ?? ""))
        payload.schoolYear = editForm.schoolYear || null;
      if (editForm.programName !== (selectedUser.profile?.programName ?? ""))
        payload.programName = editForm.programName || null;
      if (editForm.bio !== (selectedUser.profile?.bio ?? "")) payload.bio = editForm.bio || null;

      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }

      await fetchApi(`/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await refresh();
      if (selection.current !== owner) return;
      setEditing(false);
      setEditForm(null);
      await reloadUserDetail();
    } catch (caughtError) {
      if (selection.current !== owner) return;
      setActionError(caughtError instanceof Error ? caughtError.message : "用户信息更新失败。");
    } finally {
      if (selection.current === owner) setPending(null);
    }
  }

  async function saveReferralLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayUser) return;

    const trimmedDraft = referralLimitDraft.trim();
    const nextLimit = Number(trimmedDraft);
    if (!trimmedDraft || !Number.isInteger(nextLimit) || nextLimit < 0 || nextLimit > 100000) {
      // Guard the empty/blank case explicitly: Number("") === 0 would otherwise
      // silently revoke the user's quota instead of being rejected as no input.
      setActionError("普通邮箱邀请码额度上限必须是 0 到 100000 之间的整数。");
      return;
    }

    const userId = displayUser.id;
    const owner = selection.current;
    setPending("referral-limit");
    setActionError(null);
    setActionMessage(null);
    try {
      await fetchApi(`/admin/users/${userId}/referral-limit`, {
        method: "PATCH",
        body: JSON.stringify({ nonEduReferralLimit: nextLimit }),
      });
      await refresh();
      if (selection.current !== owner) return;
      setEditingReferralLimit(false);
      setReferralLimitDraft("");
      setActionMessage("普通邮箱邀请码额度已更新。");
      await reloadUserDetail();
    } catch (caughtError) {
      if (selection.current !== owner) return;
      setActionError(
        caughtError instanceof Error ? caughtError.message : "普通邮箱邀请码额度更新失败。"
      );
    } finally {
      if (selection.current === owner) setPending(null);
    }
  }

  async function toggleTestFlag() {
    if (!selectedUser) return;
    const nextValue = !selectedUser.isTest;
    const owner = selection.current;
    setPending("test-flag");
    setActionError(null);
    setActionMessage(null);
    try {
      await fetchApi(`/admin/users/${selectedUser.id}/test-flag`, {
        method: "PUT",
        body: JSON.stringify({ isTest: nextValue }),
      });
      await refresh();
      if (selection.current !== owner) return;
      await reloadUserDetail();
    } catch (caughtError) {
      if (selection.current !== owner) return;
      setActionError(caughtError instanceof Error ? caughtError.message : "操作失败。");
    } finally {
      if (selection.current === owner) setPending(null);
    }
  }

  async function deleteAllTestUsers() {
    if (
      !confirm(
        "确定删除所有标记为「测试用户」的账号？\n此操作会删除这些用户的所有数据（问卷、匹配记录、举报等），且不可撤回。"
      )
    )
      return;
    setPending("delete-test");
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await fetchApi<{ deletedCount: number }>("/admin/users/test-users", {
        method: "DELETE",
      });
      setActionError(null);
      setSelectedUserId(null);
      await refresh();
      alert(`已删除 ${result.deletedCount} 个测试用户。`);
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "删除失败。");
    } finally {
      setPending(null);
    }
  }

  async function updateUserStatus(status: "ACTIVE" | "SUSPENDED") {
    if (!displayUser || pending || displayUser.status === status || !statusAction) return;
    const successMessage = statusAction.message;
    const owner = selection.current;
    setPending(status);
    setActionError(null);
    setActionMessage(null);
    try {
      await fetchApi(`/admin/users/${displayUser.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      await refresh();
      if (selection.current !== owner) return;
      await reloadUserDetail();
      if (selection.current === owner) setActionMessage(successMessage);
    } catch (caughtError) {
      if (selection.current !== owner) return;
      setActionError(caughtError instanceof Error ? caughtError.message : "用户状态更新失败。");
    } finally {
      if (selection.current === owner) setPending(null);
    }
  }
  useEffect(() => {
    selection.current += 1;
    setPending(current => current === "delete-test" ? current : null);
    setEditing(false);
    setEditForm(null);
    setEditingReferralLimit(false);
    setReferralLimitDraft("");
    setActionError(null);
    setActionMessage(null);
    return () => { selection.current += 1; };
  }, [selectedUserId, setActionError, setActionMessage]);
  return {
    pending,
    editing,
    editForm,
    setEditForm,
    editingReferralLimit,
    referralLimitDraft,
    setReferralLimitDraft,
    statusAction,
    startEditing,
    cancelEditing,
    startEditingReferralLimit,
    cancelEditingReferralLimit,
    saveEdit,
    saveReferralLimit,
    toggleTestFlag,
    deleteAllTestUsers,
    updateUserStatus,
  };
}
