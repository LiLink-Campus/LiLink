import { redirectAuthenticatedUser } from "../../../lib/server-api";
import RegisterSchoolClient from "../register-school-client";
import { firstSearchParam } from "../utils";

type RegisterSchoolPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function RegisterSchoolPage({
  searchParams,
}: RegisterSchoolPageProps) {
  const params = await searchParams;
  const nextCandidate = firstSearchParam(params.next);

  await redirectAuthenticatedUser({ nextCandidate });

  return <RegisterSchoolClient />;
}
