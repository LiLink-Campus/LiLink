const DEFAULT_FRONTEND_TRACES_SAMPLE_RATE = 0.1;
const DEFAULT_FRONTEND_SEND_DEFAULT_PII = true;

function parseBoolean(
  rawValue: string | undefined,
  defaultValue: boolean,
): boolean {
  if (!rawValue) {
    return defaultValue;
  }

  return rawValue.trim().toLowerCase() === "true";
}

function parseSampleRate(rawValue: string | undefined): number {
  if (!rawValue) {
    return DEFAULT_FRONTEND_TRACES_SAMPLE_RATE;
  }

  const parsedValue = Number(rawValue);
  if (
    Number.isFinite(parsedValue) &&
    parsedValue >= 0 &&
    parsedValue <= 1
  ) {
    return parsedValue;
  }

  return DEFAULT_FRONTEND_TRACES_SAMPLE_RATE;
}

export const sentryDsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? "";

export const sentryEnabled = sentryDsn.length > 0;

export const sentryTracesSampleRate = parseSampleRate(
  process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
);

export const sentrySendDefaultPii = parseBoolean(
  process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII,
  DEFAULT_FRONTEND_SEND_DEFAULT_PII,
);
