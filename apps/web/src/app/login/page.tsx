import { redirectAuthenticatedUser } from "../../lib/server-api";
import LoginPageClient from "./login-page-client";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await redirectAuthenticatedUser();

  return <LoginPageClient />;
}
