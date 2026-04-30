import Link from "next/link";
import { getRequestLocale } from "../lib/locale";

export default async function NotFound() {
  const locale = await getRequestLocale();
  const copy =
    locale === "zh-CN"
      ? {
          title: "这页不在这里。",
          body: "路径可能改过，或者你还没有登录到需要的页面。",
          home: "回到首页",
        }
      : {
          title: "This page is not here.",
          body: "The path may have changed, or you may need to sign in first.",
          home: "Back home",
        };

  return (
    <main className="page-shell prose-shell">
      <section className="content-panel">
        <p className="eyebrow">404</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <Link className="button-primary" href="/">
          {copy.home}
        </Link>
      </section>
    </main>
  );
}
