import { redirectAuthenticatedUser } from "../../lib/server-api";
import LoginPageClient from "./login-page-client";

export default async function LoginPage() {
  await redirectAuthenticatedUser();

  return <LoginPageClient />;
}
