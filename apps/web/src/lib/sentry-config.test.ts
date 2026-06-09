import { describe, expect, it } from "vitest";
import {
  shouldDropInjectedAddEventListenerTagNameError,
  type SentryEventLike,
} from "./sentry-config";

describe("shouldDropInjectedAddEventListenerTagNameError", () => {
  it("drops the injected addEventListener hook null tagName error", () => {
    const event: SentryEventLike = {
      exception: {
        values: [
          {
            value: "Cannot read properties of null (reading 'tagName')",
            stacktrace: {
              frames: [
                { function: "moduleFactory" },
                { function: "top.addEventListener" },
                { function: "addEL_hook" },
              ],
            },
          },
        ],
      },
    };

    expect(shouldDropInjectedAddEventListenerTagNameError(event)).toBe(true);
  });

  it("keeps ordinary null tagName errors without the injected hook frame", () => {
    const event: SentryEventLike = {
      exception: {
        values: [
          {
            value: "Cannot read properties of null (reading 'tagName')",
            stacktrace: {
              frames: [{ function: "renderProfile" }],
            },
          },
        ],
      },
    };

    expect(shouldDropInjectedAddEventListenerTagNameError(event)).toBe(false);
  });

  it("keeps other errors from a similarly named injected hook", () => {
    const event: SentryEventLike = {
      exception: {
        values: [
          {
            value: "Cannot read properties of undefined (reading 'tagName')",
            stacktrace: {
              frames: [{ function: "addEL_hook" }],
            },
          },
        ],
      },
    };

    expect(shouldDropInjectedAddEventListenerTagNameError(event)).toBe(false);
  });

  it("keeps malformed events", () => {
    expect(shouldDropInjectedAddEventListenerTagNameError({})).toBe(false);
  });
});
