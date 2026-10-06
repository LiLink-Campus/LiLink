import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AdminUser } from "../types";
import { ADMIN_USERS_PAGE_SIZE } from "./user-display";

export function useAdminUsersList() {
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminUser["status"]>("ALL");

  const [questionnaireFilter, setQuestionnaireFilter] = useState<"all" | "submitted" | "missing">(
    "all"
  );

  const [userTypeFilter, setUserTypeFilter] = useState<"all" | "test" | "real">("all");

  const [genderFilter, setGenderFilter] = useState<"all" | "男" | "女" | "非二元">("all");

  const [page, setPage] = useState(1);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { draftSearch, submittedSearch, setDraftSearch, submitSearch } = useAdminSearch();

  const { data, loading, error, refresh } = useAdminCollection<AdminUser>("/admin/users", {
    page,
    pageSize: ADMIN_USERS_PAGE_SIZE,
    search: submittedSearch.trim(),
    status: statusFilter === "ALL" ? undefined : statusFilter,
    questionnaire: questionnaireFilter,
    userType: userTypeFilter,
    gender: genderFilter,
  });

  const users = useMemo(() => data?.items ?? [], [data]);

  useEffect(() => {
    if (selectedUserId && !users.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [users, selectedUserId]);

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    submitSearch();
  }
  return {
    statusFilter,
    setStatusFilter,
    questionnaireFilter,
    setQuestionnaireFilter,
    userTypeFilter,
    setUserTypeFilter,
    genderFilter,
    setGenderFilter,
    page,
    setPage,
    selectedUserId,
    setSelectedUserId,
    draftSearch,
    setDraftSearch,
    data,
    loading,
    error,
    refresh,
    users,
    selectedUser,
    handleSearchSubmit,
  };
}
