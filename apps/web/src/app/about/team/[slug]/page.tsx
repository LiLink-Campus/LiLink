import { notFound } from "next/navigation";
import { MemberPageView } from "./member-page-view";

export default async function MemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== "yoryon" && slug !== "member-02") notFound();
  return <MemberPageView slug={slug} />;
}
