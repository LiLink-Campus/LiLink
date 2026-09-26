"use client";

import type { CenterPageData } from "../_lib/bootstrap";
import { useProfileReadBootstrap } from "../_lib/use-profile-read-bootstrap";
import { ProfileReadPending } from "../_components/ProfileReadPending";
import { UserCenter } from "./user-center";

export function CenterBootstrap({ initialData }: { initialData: CenterPageData }) {
  const { data, error, retry } = useProfileReadBootstrap("center", initialData);
  if (!data) return <ProfileReadPending error={error} onRetry={retry} />;
  return <UserCenter initialUser={data.user} initialStatus={data.vip} />;
}
