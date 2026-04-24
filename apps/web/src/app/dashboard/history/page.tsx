import { redirect } from "next/navigation";

/**
 * Legacy deep link: history is now the second section of /dashboard/match.
 * Keep the route alive so external links (notification emails, bookmarks)
 * land on the right place after the merge.
 */
export default function DashboardHistoryPage() {
  redirect("/dashboard/match");
}
