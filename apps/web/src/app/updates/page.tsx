import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DEVLOG_UPDATES_PAGE_SIZE } from "@/lib/devlog-constants";
import {
  getDevlogBaseUrl,
  getDevlogFeed,
  paginateDevlogItems,
  parseDevlogUpdatesPage,
} from "@/lib/devlog-feed";
import { UpdatesPageView } from "./updates-page-view";

export const metadata: Metadata = {
  title: "产品更新 · LiLink",
  description: "LiLink 的每一次迭代：我们解决了哪些问题，体验有了什么变化。",
};

type UpdatesPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function UpdatesPage({ searchParams }: UpdatesPageProps) {
  const isDev = process.env.NODE_ENV === "development";
  const params = await searchParams;
  const requestedPage = parseDevlogUpdatesPage(params.page);
  const feed = await getDevlogFeed();
  const pagination = paginateDevlogItems(feed.items, requestedPage, DEVLOG_UPDATES_PAGE_SIZE);
  if (pagination.page !== requestedPage) {
    // Out-of-range / non-canonical ?page -> redirect to the canonical URL so the
    // address bar matches the page actually rendered instead of silently clamping.
    redirect(pagination.page <= 1 ? "/updates" : `/updates?page=${pagination.page}`);
  }
  return (
    <UpdatesPageView
      feed={feed}
      page={pagination.page}
      archiveUrl={getDevlogBaseUrl()}
      isDev={isDev}
    />
  );
}
