import { useState } from "react";
import { useAdminUsersList } from "./use-admin-users-list";
import { useAdminUserDetail } from "./use-admin-user-detail";
import { useAdminUserActions } from "./use-admin-user-actions";

export function useAdminUsers() {
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const list = useAdminUsersList();
  const detail = useAdminUserDetail(list.selectedUserId, list.selectedUser, setActionError);
  const actions = useAdminUserActions(list, detail, setActionError, setActionMessage);
  return { ...list, ...detail, ...actions, actionError, actionMessage };
}
export type AdminUsersModel = ReturnType<typeof useAdminUsers>;
