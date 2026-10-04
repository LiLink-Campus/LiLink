import { generateDynamicSentryMetadata } from "../../../../lib/sentry-request-metadata";

import { notFound } from "next/navigation";
import { MemberPageView } from "./member-page-view";

export const generateMetadata = generateDynamicSentryMetadata;

export default async function MemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== "yoryon" && slug !== "member-02" && slug !== "devillord6321") notFound();
  return <MemberPageView slug={slug} />;
}
