import { generateDynamicSentryMetadata } from "../../lib/sentry-request-metadata";

import { redirectAuthenticatedUser } from "../../lib/server-api";
import RegisterChooserClient from "./register-chooser-client";
import { firstSearchParam } from "./utils";

export const generateMetadata = generateDynamicSentryMetadata;

type RegisterPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const nextCandidate = firstSearchParam(params.next);

  await redirectAuthenticatedUser({ nextCandidate });

  return <RegisterChooserClient />;
}
