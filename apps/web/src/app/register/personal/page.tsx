import { redirectAuthenticatedUser } from "../../../lib/server-api";
import RegisterPersonalClient from "../register-personal-client";

type RegisterPersonalPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function RegisterPersonalPage({
  searchParams,
}: RegisterPersonalPageProps) {
  const params = await searchParams;
  const nextParam = params.next;
  const nextCandidate =
    typeof nextParam === "string"
      ? nextParam
      : Array.isArray(nextParam)
        ? nextParam[0]
        : undefined;

  await redirectAuthenticatedUser({ nextCandidate });

  return <RegisterPersonalClient />;
}
