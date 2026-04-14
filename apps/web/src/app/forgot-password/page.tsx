import { redirectAuthenticatedUser } from "../../lib/server-api";
import ForgotPasswordPageClient from "./forgot-password-page-client";

export default async function ForgotPasswordPage() {
  await redirectAuthenticatedUser();

  return <ForgotPasswordPageClient />;
}
