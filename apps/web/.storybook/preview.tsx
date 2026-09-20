import type { Preview } from "@storybook/nextjs-vite";
import "../src/app/globals.css";
import MockDate from "mockdate";
import { initialize, mswLoader } from "msw-storybook-addon";
import { AuthSessionProvider } from "../src/app/auth-session";
import { ToastProvider } from "../src/app/dashboard/_components/ToastProvider";
import { mswHandlers } from "./msw-handlers";
import { siteHandlers } from "../src/stories/site-support";

initialize({
  quiet: true,
  onUnhandledRequest(request, print) {
    const url = new URL(request.url);
    // Keep API mocking strict while allowing the application's own assets.
    const localAsset =
      url.pathname.startsWith("/@id/virtual:next") ||
      (url.pathname.startsWith("/src/") && url.pathname.endsWith(".css")) ||
      /^\/(images|icons|fonts)\//.test(url.pathname);
    if (request.method === "GET" && url.origin === window.location.origin && localAsset) return;
    print.error();
  },
});

function isFixedNowParameter(value: unknown): value is string | number | Date {
  return typeof value === "string" || typeof value === "number" || value instanceof Date;
}

const preview: Preview = {
  decorators: [
    (Story) => (
      <AuthSessionProvider>
        <ToastProvider>
          <Story />
        </ToastProvider>
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
      handlers: { ...mswHandlers, site: siteHandlers },
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
        mobile407: {
          name: "Mobile 407",
          styles: { width: "407px", height: "908px" },
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
  afterEach({ id }) {
    document.documentElement.dataset.storybookReady = id;
  },
  beforeEach({ parameters }) {
    delete document.documentElement.dataset.storybookReady;
    if (parameters.fullSite) {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie = "lilink_ref=; path=/; max-age=0; samesite=lax";
    }
    const fixedNow = parameters.fixedNow;
    if (fixedNow === undefined) return undefined;

    if (!isFixedNowParameter(fixedNow)) {
      throw new Error("Storybook fixedNow parameter must be a date string, timestamp, or Date.");
    }

    MockDate.set(fixedNow);
    return () => {
      MockDate.reset();
    };
  },
};

export default preview;
