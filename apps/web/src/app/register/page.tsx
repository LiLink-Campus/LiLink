import { redirectAuthenticatedUser } from "../../lib/server-api";
import RegisterPageClient from "./register-page-client";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  await redirectAuthenticatedUser();

  return <RegisterPageClient />;
}
