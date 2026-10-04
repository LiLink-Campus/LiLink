import "server-only";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getTraceData } from "@sentry/nextjs";

// Export only from routes that already render at request time. Request APIs in
// the root layout would turn public ISR pages into dynamic SSR.
export async function generateDynamicSentryMetadata(): Promise<Metadata> {
  await connection();
  const trace = getTraceData();
  return {
    other: {
      ...(trace["sentry-trace"] ? { "sentry-trace": trace["sentry-trace"] } : {}),
      ...(trace.baggage ? { baggage: trace.baggage } : {}),
    },
  };
}
