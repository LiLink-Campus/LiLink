import { AuthRedirectGate } from "../auth-redirect-gate";
import { hasUserSessionCookie } from "../../lib/server-api";
import RegisterPageClient from "./register-page-client";

export default async function RegisterPage() {
  const hasSessionCookie = await hasUserSessionCookie();

  return (
    <AuthRedirectGate blockUntilHydrated={hasSessionCookie}>
      <RegisterPageClient />
    </AuthRedirectGate>
  );
}
