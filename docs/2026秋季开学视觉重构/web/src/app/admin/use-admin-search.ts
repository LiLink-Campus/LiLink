"use client";

import { useState } from "react";

export function useAdminSearch(initialSearch = "") {
  const [draftSearch, setDraftSearch] = useState(initialSearch);
  const [submittedSearch, setSubmittedSearch] = useState(initialSearch);

  function submitSearch() {
    setSubmittedSearch(draftSearch);
  }

  function clearSearch() {
    setDraftSearch("");
    setSubmittedSearch("");
  }

  return {
    draftSearch,
    submittedSearch,
    setDraftSearch,
    submitSearch,
    clearSearch,
  };
}
