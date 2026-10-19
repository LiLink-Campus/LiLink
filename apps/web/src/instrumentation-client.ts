// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { initializeInstallCapture } from "./lib/pwa-install-state";
import { loadReplayForError, scheduleReplay } from "./lib/deferred-replay";

import * as Sentry from "@sentry/nextjs";
import {
  sentryDsn,
  sentryEnabled,
  sentrySendDefaultPii,
  sentryTracesSampleRate,
  shouldDropInjectedAddEventListenerTagNameError,
} from "./lib/sentry-config";

initializeInstallCapture();

Sentry.init({
  dsn: sentryDsn || undefined,
  enabled: sentryEnabled,

  // Replay is installed after load/idle, or on the first captured error.

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: sentryTracesSampleRate,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: sentrySendDefaultPii,

  beforeSend(event) {
    if (shouldDropInjectedAddEventListenerTagNameError(event)) {
      return null;
    }

    if (event.exception) loadReplayForError();
    return event;
  },
});

scheduleReplay();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
