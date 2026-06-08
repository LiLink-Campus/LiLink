import { redirectAuthenticatedUser } from "../../../lib/server-api";
import RegisterPersonalClient from "../register-personal-client";
import { firstSearchParam } from "../utils";

type RegisterPersonalPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function RegisterPersonalPage({
  searchParams,
}: RegisterPersonalPageProps) {
  const params = await searchParams;
  const nextCandidate = firstSearchParam(params.next);

  await redirectAuthenticatedUser({ nextCandidate });

  return <RegisterPersonalClient />;
}
