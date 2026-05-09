import { redirectAuthenticatedUser } from "../../lib/server-api";
import RegisterPageClient from "./register-page-client";

type RegisterPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const nextParam = params.next;
  const nextCandidate =
    typeof nextParam === "string"
      ? nextParam
      : Array.isArray(nextParam)
        ? nextParam[0]
        : undefined;

  await redirectAuthenticatedUser({ nextCandidate });

  return <RegisterPageClient />;
}
