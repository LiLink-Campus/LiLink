import { redirectAuthenticatedUser } from "../../lib/server-api";
import LoginPageClient from "./login-page-client";

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextParam = params.next;
  const nextCandidate =
    typeof nextParam === "string"
      ? nextParam
      : Array.isArray(nextParam)
        ? nextParam[0]
        : undefined;

  await redirectAuthenticatedUser({ nextCandidate });

  return <LoginPageClient />;
}
