import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useLayoutEffect } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import type { MeetupFeedback } from "../../../lib/api";
import { MeetupFeedbackForm } from "./MeetupFeedbackForm";

type FeedbackFixture = "empty" | "existing";

type MeetupFeedbackFormDemoArgs = {
  feedbackFixture: FeedbackFixture;
  saving: boolean;
  submitError: string | null;
};

const existingFeedback = {
  personalFitScore: 4,
  interactionQualityScore: 5,
  safetyBoundaryLevel: "NO_CONCERN",
  positiveTags: ["EASY_TO_TALK", "GOOD_LISTENER"],
  issueTags: ["LOW_EFFORT"],
  note: "整体交流自然，对方很守时；中间有一小段需要平台参考。",
  submittedAt: "2030-04-18T13:30:00.000Z",
} satisfies MeetupFeedback;

function EnsureStoryDialogOpen() {
  useLayoutEffect(() => {
    const dialog = Array.from(
      document.querySelectorAll<HTMLDialogElement>("dialog"),
    ).find((element) => element.textContent?.includes("会后反馈"));
    if (!dialog || dialog.open) return;

    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute("open", "");
    }
  }, []);

  return null;
}

function MeetupFeedbackFormDemo({
  feedbackFixture,
  saving,
  submitError,
}: MeetupFeedbackFormDemoArgs) {
  const feedback = feedbackFixture === "existing" ? existingFeedback : null;

  return (
    <>
      <MeetupFeedbackForm
        open
        feedback={feedback}
        saving={saving}
        submitError={submitError}
        onSubmit={fn()}
        onCancel={fn()}
        onDismissSubmitError={fn()}
      />
      <EnsureStoryDialogOpen />
    </>
  );
}

const meta = {
  title: "Dashboard/Meetup/Components/MeetupFeedbackForm",
  component: MeetupFeedbackFormDemo,
  tags: ["smoke"],
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/dashboard/meetup/meetup-session-story-001",
      },
    },
  },
  argTypes: {
    feedbackFixture: {
      control: "inline-radio",
      options: ["empty", "existing"],
    },
    saving: {
      control: "boolean",
    },
    submitError: {
      control: "text",
    },
  },
  args: {
    feedbackFixture: "empty",
    saving: false,
    submitError: null,
  },
} satisfies Meta<typeof MeetupFeedbackFormDemo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EmptyReady: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = await canvas.findByRole("heading", { name: "会后反馈" });
    const submitButton = canvas.getByRole("button", { name: "保存会后反馈" });

    await waitFor(() => expect(heading).toBeVisible());
    await waitFor(() => expect(submitButton).toBeEnabled());
  },
};

export const RequiredFieldValidation: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const submitButton = await canvas.findByRole("button", {
      name: "保存会后反馈",
    });

    await waitFor(() => expect(submitButton).toBeVisible());
    await userEvent.click(submitButton);
    const validationMessage = await canvas.findByText(
      "请选择见面后的个人契合感。",
    );
    await waitFor(() => expect(validationMessage).toBeVisible());
  },
};

export const SubmitErrorToast: Story = {
  args: {
    submitError: "会后反馈提交失败，请稍后再试。",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = await canvas.findByRole("alert");

    await waitFor(() => expect(alert).toBeVisible());
    await expect(alert).toHaveTextContent(
      "会后反馈提交失败，请稍后再试。",
    );
  },
};

export const ExistingFeedbackEdit: Story = {
  args: {
    feedbackFixture: "existing",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const note = canvas.getByText(
      "整体交流自然，对方很守时；中间有一小段需要平台参考。",
    );

    await expect(
      await canvas.findByRole("radio", { name: /比较合适/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      canvas.getByRole("radio", { name: /很轻松舒服/ }),
    ).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(note).toBeVisible());
  },
};
