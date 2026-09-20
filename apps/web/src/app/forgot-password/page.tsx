import ForgotPasswordPageClient from "./forgot-password-page-client";
import type { AuthMePayload } from "../../lib/api";
import { fetchUserApiServer, hasUserSessionCookie } from "../../lib/server-api";

export default async function ForgotPasswordPage() {
  const user = await hasUserSessionCookie()
    ? await fetchUserApiServer<AuthMePayload>("/auth/me").catch(() => null)
    : null;
  return <ForgotPasswordPageClient initialEmail={user?.email} />;
}
