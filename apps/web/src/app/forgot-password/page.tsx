import { AuthRedirectGate } from "../auth-redirect-gate";
import { hasUserSessionCookie } from "../../lib/server-api";
import ForgotPasswordPageClient from "./forgot-password-page-client";

export default async function ForgotPasswordPage() {
  const hasSessionCookie = await hasUserSessionCookie();

  return (
    <AuthRedirectGate blockUntilHydrated={hasSessionCookie}>
      <ForgotPasswordPageClient />
    </AuthRedirectGate>
  );
}
