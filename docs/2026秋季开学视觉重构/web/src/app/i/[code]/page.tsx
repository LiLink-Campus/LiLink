import { ReferralLandingClient } from "./landing-client";

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ReferralLandingClient code={code} />;
}
