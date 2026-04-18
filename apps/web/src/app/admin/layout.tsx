import {
  fetchAdminApiServer,
  hasAdminSessionCookie,
} from "../../lib/server-api";
import AdminLayoutShell from "./admin-layout-shell";
import type { AdminIdentity } from "./admin-context";
import "../protected.css";
import "./admin.css";

async function getInitialAdmin() {
  const hasSessionCookie = await hasAdminSessionCookie();
  if (!hasSessionCookie) {
    return {
      admin: null,
      authChecked: true,
    };
  }

  try {
    const payload = await fetchAdminApiServer<{
      ok: true;
      admin: AdminIdentity;
    }>("/admin-session/me");

    return {
      admin: payload.admin,
      authChecked: true,
    };
  } catch {
    return {
      admin: null,
      authChecked: true,
    };
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { admin, authChecked } = await getInitialAdmin();

  return (
    <AdminLayoutShell initialAdmin={admin} authChecked={authChecked}>
      {children}
    </AdminLayoutShell>
  );
}
