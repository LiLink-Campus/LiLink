import { useEffect, useMemo, useRef, useState } from "react";
import { fetchApi } from "../../../lib/api";
import type {
  AdminSchool,
  AdminUser,
  AdminUserDetail,
  AdminUserParticipation,
  AdminUserQuestionnaire,
  PaginatedResult,
} from "../types";
import { HARD_MATCH_KEY_SET, ADMIN_SCHOOL_LOOKUP_PAGE_SIZE, DetailTab } from "./user-display";

export function useAdminUserDetail(
  selectedUserId: string | null,
  selectedUser: AdminUser | null,
  setActionError: (error: string | null) => void
) {
  const selection = useRef({ id: selectedUserId });
  useEffect(() => {
    const owner = { id: selectedUserId };
    selection.current = owner;
    return () => {
      if (selection.current === owner) selection.current = { id: null };
    };
  }, [selectedUserId]);

  const [detailTab, setDetailTab] = useState<DetailTab>("profile");

  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);

  const [questionnaireData, setQuestionnaireData] = useState<AdminUserQuestionnaire>(null);

  const [participationsData, setParticipationsData] =
    useState<PaginatedResult<AdminUserParticipation> | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);

  const [questionnaireLoading, setQuestionnaireLoading] = useState(false);

  const [participationsLoading, setParticipationsLoading] = useState(false);

  const [detailError, setDetailError] = useState<string | null>(null);

  const [schoolNameById, setSchoolNameById] = useState<Record<string, string>>({});

  const activeUserDetail = userDetail && userDetail.id === selectedUserId ? userDetail : null;

  const displayUser = activeUserDetail ?? selectedUser;

  const effectiveDetailTab =
    activeUserDetail && activeUserDetail.id === selectedUserId ? detailTab : "profile";

  useEffect(() => {
    let cancelled = false;

    void fetchApi<PaginatedResult<AdminSchool>>(
      `/admin/schools?page=1&pageSize=${ADMIN_SCHOOL_LOOKUP_PAGE_SIZE}`
    )
      .then((payload) => {
        if (cancelled) return;
        setSchoolNameById(
          Object.fromEntries(payload.items.map((school) => [school.id, school.name]))
        );
      })
      .catch(() => {
        if (!cancelled) {
          setSchoolNameById({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setUserDetail(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    void fetchApi<AdminUserDetail>(`/admin/users/${selectedUserId}`)
      .then((user) => {
        if (!cancelled) setUserDetail(user);
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setUserDetail(null);
          setDetailError(caughtError instanceof Error ? caughtError.message : "加载用户详情失败。");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUserId]);

  async function reloadUserDetail() {
    const owner = selection.current;
    if (!selectedUserId || owner.id !== selectedUserId) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const user = await fetchApi<AdminUserDetail>(`/admin/users/${selectedUserId}`);
      if (selection.current === owner) setUserDetail(user);
    } catch (caughtError) {
      if (selection.current !== owner) return;
      setUserDetail(null);
      setDetailError(caughtError instanceof Error ? caughtError.message : "加载用户详情失败。");
    } finally {
      if (selection.current === owner) setDetailLoading(false);
    }
  }

  const questionnaireAnswerCount = useMemo(() => {
    if (activeUserDetail) {
      return activeUserDetail.questionnaireAnswerCount;
    }

    return null;
  }, [activeUserDetail]);

  const answerGroups = useMemo(() => {
    if (effectiveDetailTab !== "questionnaire") return null;
    const answers = questionnaireData?.answers;
    if (!answers || typeof answers !== "object") return null;

    const entries = Object.entries(answers as Record<string, unknown>);
    const hardMatch = entries.filter(([k]) => HARD_MATCH_KEY_SET.has(k));
    const questionnaire = entries.filter(([k]) => !HARD_MATCH_KEY_SET.has(k));
    return { hardMatch, questionnaire, total: entries.length };
  }, [effectiveDetailTab, questionnaireData]);

  useEffect(() => {
    if (detailTab !== "questionnaire" || !selectedUserId) {
      return;
    }

    let cancelled = false;
    setQuestionnaireLoading(true);

    void fetchApi<AdminUserQuestionnaire>(`/admin/users/${selectedUserId}/questionnaire`)
      .then((payload) => {
        if (!cancelled) {
          setQuestionnaireData(payload);
        }
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setActionError(caughtError instanceof Error ? caughtError.message : "问卷详情加载失败。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setQuestionnaireLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailTab, selectedUserId, setActionError]);

  useEffect(() => {
    if (detailTab !== "cycles" || !selectedUserId) {
      return;
    }

    let cancelled = false;
    setParticipationsLoading(true);

    void fetchApi<PaginatedResult<AdminUserParticipation>>(
      `/admin/users/${selectedUserId}/participations?page=1&pageSize=${ADMIN_SCHOOL_LOOKUP_PAGE_SIZE}`
    )
      .then((payload) => {
        if (!cancelled) {
          setParticipationsData(payload);
        }
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setActionError(
            caughtError instanceof Error ? caughtError.message : "轮次参与记录加载失败。"
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setParticipationsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailTab, selectedUserId, setActionError]);
  useEffect(() => {
    setDetailTab("profile");
    setQuestionnaireData(null);
    setParticipationsData(null);
  }, [selectedUserId]);
  return {
    detailTab,
    setDetailTab,
    userDetail,
    detailLoading,
    questionnaireLoading,
    participationsLoading,
    detailError,
    schoolNameById,
    displayUser,
    effectiveDetailTab,
    questionnaireAnswerCount,
    answerGroups,
    participationsData,
    reloadUserDetail,
  };
}
