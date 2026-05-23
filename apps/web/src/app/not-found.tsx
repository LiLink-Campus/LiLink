import { ButtonLink, Card } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="page-shell prose-shell">
      <Card className="prose-panel" layout="plain">
        <p className="eyebrow">404</p>
        <h1>这页不在这里。</h1>
        <p>路径可能改过，或者你还没有登录到需要的页面。</p>
        <ButtonLink href="/">
          回到首页
        </ButtonLink>
      </Card>
    </main>
  );
}
