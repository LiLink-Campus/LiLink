"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

function sampleAnalytics(event: BeforeSendEvent) {
  return Math.random() < 0.5 ? event : null;
}

export function UsageAnalytics({ speedInsights }: { speedInsights: boolean }) {
  return <>
    <Analytics beforeSend={sampleAnalytics} />
    {speedInsights && <SpeedInsights sampleRate={0.01} />}
  </>;
}
