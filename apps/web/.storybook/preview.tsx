import type { Preview } from "@storybook/nextjs-vite";
import "../src/app/globals.css";
import MockDate from "mockdate";
import { initialize, mswLoader } from "msw-storybook-addon";
import { AuthSessionProvider } from "../src/app/auth-session";
import { LocaleProvider } from "../src/app/locale-context";
import { ToastProvider } from "../src/app/dashboard/_components/ToastProvider";
import { mswHandlers } from "./msw-handlers";

initialize({ onUnhandledRequest: "error" });

function isFixedNowParameter(
  value: unknown,
): value is string | number | Date {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    value instanceof Date
  );
}

const preview: Preview = {
  decorators: [
    (Story) => (
      <AuthSessionProvider>
        <LocaleProvider initialLocale="zh-CN" hasLocaleCookie={true}>
          <ToastProvider>
            <Story />
          </ToastProvider>
        </LocaleProvider>
      </AuthSessionProvider>
    ),
  ],
  loaders: [mswLoader],
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
    msw: {
      handlers: mswHandlers,
    },
    viewport: {
      options: {
        mobile360: {
          name: "Mobile 360",
          styles: {
            width: "360px",
            height: "740px",
          },
        },
        mobile390: {
          name: "Mobile 390",
          styles: {
            width: "390px",
            height: "844px",
          },
        },
        mobile430: {
          name: "Mobile 430",
          styles: {
            width: "430px",
            height: "932px",
          },
        },
        tablet768: {
          name: "Tablet 768",
          styles: {
            width: "768px",
            height: "1024px",
          },
        },
        desktop1280: {
          name: "Desktop 1280",
          styles: {
            width: "1280px",
            height: "900px",
          },
        },
      },
    },
    a11y: {
      test: "todo",
    },
  },
  beforeEach({ parameters }) {
    const fixedNow = parameters.fixedNow;
    if (fixedNow === undefined) return undefined;

    if (!isFixedNowParameter(fixedNow)) {
      throw new Error(
        "Storybook fixedNow parameter must be a date string, timestamp, or Date.",
      );
    }

    MockDate.set(fixedNow);
    return () => {
      MockDate.reset();
    };
  },
};

export default preview;
