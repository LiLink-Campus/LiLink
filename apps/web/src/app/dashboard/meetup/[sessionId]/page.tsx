import { redirect } from "next/navigation";
import { generateDynamicSentryMetadata } from "../../../../lib/sentry-request-metadata";

export const generateMetadata = generateDynamicSentryMetadata;

export default function RetiredMeetupPage() {
  redirect("/dashboard/match");
}
