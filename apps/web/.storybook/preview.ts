import type { Preview } from "@storybook/nextjs-vite";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
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
};

export default preview;
