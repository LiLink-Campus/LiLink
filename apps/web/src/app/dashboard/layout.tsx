import type { ReactNode } from "react";
import { AppShell } from "./_components/AppShell";
import "../protected.css";
import "./dashboard.css";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
