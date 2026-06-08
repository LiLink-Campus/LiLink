import { redirectAuthenticatedUser } from "../../../lib/server-api";
import RegisterSchoolClient from "../register-school-client";

type RegisterSchoolPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function RegisterSchoolPage({
  searchParams,
}: RegisterSchoolPageProps) {
  const params = await searchParams;
  const nextParam = params.next;
  const nextCandidate =
    typeof nextParam === "string"
      ? nextParam
      : Array.isArray(nextParam)
        ? nextParam[0]
        : undefined;

  await redirectAuthenticatedUser({ nextCandidate });

  return <RegisterSchoolClient />;
}
