import type { ReactNode } from "react";
import { getRequestLocaleResult } from "../../lib/locale";
import { LocaleProvider } from "../locale-context";
import { AppShell } from "./_components/AppShell";
import { ToastProvider } from "./_components/ToastProvider";
import "../protected.css";
import "./dashboard.css";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const localeResult = await getRequestLocaleResult();

  return (
    <LocaleProvider
      initialLocale={localeResult.locale}
      hasLocaleCookie={localeResult.source === "cookie"}
    >
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </LocaleProvider>
  );
}
