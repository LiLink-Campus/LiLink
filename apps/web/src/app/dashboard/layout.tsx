import type { ReactNode } from "react";
import { AppShell } from "./_components/AppShell";
import { ToastProvider } from "./_components/ToastProvider";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <AppShell>{children}</AppShell>
    </ToastProvider>
  );
}
