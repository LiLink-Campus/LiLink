import { AuthRedirectGate } from "../auth-redirect-gate";
import { hasUserSessionCookie } from "../../lib/server-api";
import LoginPageClient from "./login-page-client";

export default async function LoginPage() {
  const hasSessionCookie = await hasUserSessionCookie();

  return (
    <AuthRedirectGate blockUntilHydrated={hasSessionCookie}>
      <LoginPageClient />
    </AuthRedirectGate>
  );
}
