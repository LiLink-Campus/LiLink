"use client";

import { createContext, useContext, useState } from "react";

export const ProfileWriteOwner = createContext<symbol | null>(null);

export function useProfileWriteOwner() {
  const owner = useContext(ProfileWriteOwner);
  const [fallback] = useState(() => Symbol("profile-editor"));
  return owner ?? fallback;
}
