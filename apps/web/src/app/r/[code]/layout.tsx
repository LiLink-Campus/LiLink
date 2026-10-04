import type { ReactNode } from "react";
import { generateDynamicSentryMetadata } from "../../../lib/sentry-request-metadata";

export const generateMetadata = generateDynamicSentryMetadata;

export default function RedemptionLayout({ children }: { children: ReactNode }) {
  return children;
}
