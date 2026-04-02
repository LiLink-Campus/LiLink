import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-shell prose-shell">
      <section className="content-panel">
        <p className="eyebrow">404</p>
        <h1>这页不在这里。</h1>
        <p>路径可能改过，或者你还没有登录到需要的页面。</p>
        <Link className="button-primary" href="/">
          回到首页
        </Link>
      </section>
    </main>
  );
}

