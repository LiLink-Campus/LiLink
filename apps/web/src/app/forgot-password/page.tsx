import { redirectAuthenticatedUser } from "../../lib/server-api";
import ForgotPasswordPageClient from "./forgot-password-page-client";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  await redirectAuthenticatedUser();

  return <ForgotPasswordPageClient />;
}
