import Link from "next/link";
import { LocalizedText } from "./localized-text";

export default function NotFound() {
  return (
    <main className="page-shell prose-shell">
      <section className="content-panel">
        <p className="eyebrow">404</p>
        <h1>
          <LocalizedText zh="这页不在这里。" en="This page is not here." />
        </h1>
        <p>
          <LocalizedText
            zh="路径可能改过，或者你还没有登录到需要的页面。"
            en="The path may have changed, or you may need to sign in first."
          />
        </p>
        <Link className="button-primary" href="/">
          <LocalizedText zh="回到首页" en="Back home" />
        </Link>
      </section>
    </main>
  );
}
