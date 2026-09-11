const DEFAULT_FRONTEND_TRACES_SAMPLE_RATE = 0.1;
const DEFAULT_FRONTEND_SEND_DEFAULT_PII = true;
const INJECTED_ADD_EVENT_LISTENER_TAG_NAME_ERROR =
  "Cannot read properties of null (reading 'tagName')";
const INJECTED_ADD_EVENT_LISTENER_HOOK = "addEL_hook";

type SentryStackFrameLike = {
  function?: string;
};

type SentryExceptionLike = {
  value?: string;
  stacktrace?: {
    frames?: SentryStackFrameLike[];
  };
};

export type SentryEventLike = {
  exception?: {
    values?: SentryExceptionLike[];
  };
};

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

export function shouldDropInjectedAddEventListenerTagNameError(
  event: SentryEventLike,
): boolean {
  return (
    event.exception?.values?.some(
      (exception) =>
        exception.value === INJECTED_ADD_EVENT_LISTENER_TAG_NAME_ERROR &&
        exception.stacktrace?.frames?.some(
          (frame) => frame.function === INJECTED_ADD_EVENT_LISTENER_HOOK,
        ),
    ) ?? false
  );
}
