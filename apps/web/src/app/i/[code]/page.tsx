import { generateDynamicSentryMetadata } from "../../../lib/sentry-request-metadata";

import { ReferralLandingClient } from "./landing-client";

export const generateMetadata = generateDynamicSentryMetadata;

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ReferralLandingClient code={code} />;
}
