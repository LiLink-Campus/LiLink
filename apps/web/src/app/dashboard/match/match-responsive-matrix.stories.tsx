import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MatchClientView } from "./match-client";
import {
  matchDashboardFixtures,
  matchStoryUser,
} from "./match.fixtures";

const pageStatesTitle = "Dashboard/Match/Page States";
const responsiveMatrixTitle = "Visual QA/Dashboard/Match/Responsive Matrix";

const meta = {
  title: responsiveMatrixTitle,
  component: MatchClientView,
  globals: {
    viewport: {
      value: "desktop1280",
    },
  },
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/dashboard/match",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "100dvh", background: "var(--color-canvas)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MatchClientView>;

export default meta;

type Story = StoryObj<typeof meta>;
type StoryIdSuffix =
  | "introduced-contact-completed"
  | "introduced-with-meetup-scheduled"
  | "matched-not-introduced";

const broadviewViewports = [
  { name: "Mobile 360", width: 360, height: 740, scale: 0.56 },
  { name: "Mobile 390", width: 390, height: 844, scale: 0.52 },
  { name: "Mobile 430", width: 430, height: 932, scale: 0.48 },
  { name: "Tablet 768", width: 768, height: 1024, scale: 0.35 },
  { name: "Desktop 1280", width: 1280, height: 900, scale: 0.22 },
] as const;

const pageStateStoryIdPrefix = pageStatesTitle
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const broadviewScenarios = [
  {
    title: "Introduced / long contact",
    storyIdSuffix: "introduced-contact-completed",
  },
  {
    title: "Introduced / meetup scheduled",
    storyIdSuffix: "introduced-with-meetup-scheduled",
  },
  {
    title: "Matched / not introduced",
    storyIdSuffix: "matched-not-introduced",
  },
] as const satisfies readonly { title: string; storyIdSuffix: StoryIdSuffix }[];

const broadviewRootStyle: CSSProperties = {
  padding: "20px",
  display: "grid",
  gap: "28px",
  background: "var(--color-canvas)",
};

const broadviewSectionStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
};

const broadviewHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
};

const broadviewTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "16px",
  fontWeight: 700,
  color: "var(--color-text)",
};

const broadviewHintStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--color-text-muted)",
};

const broadviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, max-content))",
  gap: "14px",
  alignItems: "start",
};

function MatchViewportPreview({
  scenarioTitle,
  storyIdSuffix,
  viewport,
}: {
  scenarioTitle: string;
  storyIdSuffix: StoryIdSuffix;
  viewport: (typeof broadviewViewports)[number];
}) {
  const scaledWidth = Math.round(viewport.width * viewport.scale);
  const scaledHeight = Math.round(viewport.height * viewport.scale);
  const storyId = `${pageStateStoryIdPrefix}--${storyIdSuffix}`;

  return (
    <article style={{ display: "grid", gap: "8px", width: scaledWidth }}>
      <div style={{ display: "grid", gap: "2px" }}>
        <strong style={{ fontSize: "12px", color: "var(--color-text)" }}>
          {viewport.name}
        </strong>
        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
          {viewport.width}x{viewport.height} at{" "}
          {Math.round(viewport.scale * 100)}%
        </span>
      </div>
      <div
        data-testid={`responsive-matrix-frame-${storyIdSuffix}-${viewport.width}`}
        style={{
          width: scaledWidth,
          height: scaledHeight,
          overflow: "hidden",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          background: "var(--color-canvas)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <iframe
          src={`./iframe.html?id=${storyId}&viewMode=story`}
          title={`${scenarioTitle} - ${viewport.name} preview`}
          style={{
            width: viewport.width,
            height: viewport.height,
            border: 0,
            display: "block",
            transform: `scale(${viewport.scale})`,
            transformOrigin: "top left",
            background: "var(--color-canvas)",
          }}
        />
      </div>
    </article>
  );
}

function ResponsiveMatrixPreview() {
  return (
    <div style={broadviewRootStyle}>
      {broadviewScenarios.map((scenario) => (
        <section key={scenario.storyIdSuffix} style={broadviewSectionStyle}>
          <div style={broadviewHeaderStyle}>
            <h2 style={broadviewTitleStyle}>{scenario.title}</h2>
            <span style={broadviewHintStyle}>
              Scaled viewport overview for fast responsive scans
            </span>
          </div>
          <div style={broadviewGridStyle}>
            {broadviewViewports.map((viewport) => (
              <MatchViewportPreview
                key={viewport.name}
                scenarioTitle={scenario.title}
                storyIdSuffix={scenario.storyIdSuffix}
                viewport={viewport}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export const ResponsiveMatrix = {
  name: "Responsive matrix",
  args: {
    initialUser: matchStoryUser,
    initialDashboard: matchDashboardFixtures.introducedContactCompleted,
  },
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => <ResponsiveMatrixPreview />,
} satisfies Story;
