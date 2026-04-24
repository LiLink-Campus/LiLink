import { redirect } from "next/navigation";

/**
 * Legacy deep link: weekly intent now lives on /dashboard via the
 * participation toggle + bottom sheet. Keep the route alive so old
 * links land on the new home hub.
 */
export default function DashboardIntentPage() {
  redirect("/dashboard");
}
