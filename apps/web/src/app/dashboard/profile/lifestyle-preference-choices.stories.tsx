import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import { LIFESTYLE_QUESTIONS } from "@lilink/shared";
import { LifestylePreferenceChoices } from "./lifestyle-preference-choices";
import { QuestionField, QuestionHeading } from "./question-components";

function Fixture(props: ComponentProps<typeof LifestylePreferenceChoices>) {
  const [value, setValue] = useState(props.value);
  return <QuestionField style={{ maxWidth: 480 }}>
    <QuestionHeading>希望对方吸烟情况</QuestionHeading>
    <LifestylePreferenceChoices {...props} value={value} onChange={next => { props.onChange(next); setValue(next); }} />
  </QuestionField>;
}

const meta = {
  title: "Questionnaire/LifestylePreferences",
  component: LifestylePreferenceChoices,
  tags: ["smoke"],
  args: { value: [], options: LIFESTYLE_QUESTIONS[1].options, onChange: fn() },
  render: args => <Fixture {...args} />,
} satisfies Meta<typeof LifestylePreferenceChoices>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LegacyUnrestricted: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.queryByRole("checkbox", { name: "不限" })).toBeNull();
    for (const input of c.getAllByRole("checkbox")) await expect(input).toBeChecked();
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.click(c.getByRole("checkbox", { name: "每天吸烟" }));
    await expect(args.onChange).toHaveBeenLastCalledWith(["不吸烟", "偶尔吸烟", "经常吸烟"]);
    await userEvent.click(c.getByRole("checkbox", { name: "每天吸烟" }));
    await expect(args.onChange).toHaveBeenLastCalledWith([]);
    for (const input of c.getAllByRole("checkbox")) await expect(input).toBeChecked();
  },
};

export const ExistingSelection: Story = {
  args: { value: ["不吸烟"] },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    const onlyChoice = c.getByRole("checkbox", { name: "不吸烟" });
    await expect(onlyChoice).toBeChecked();
    await expect(onlyChoice).toBeDisabled();
    await userEvent.click(onlyChoice);
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.click(c.getByRole("checkbox", { name: "偶尔吸烟" }));
    await expect(onlyChoice).toBeEnabled();
    await userEvent.click(onlyChoice);
    await expect(args.onChange).toHaveBeenLastCalledWith(["偶尔吸烟"]);
    await expect(c.getByRole("checkbox", { name: "偶尔吸烟" })).toBeDisabled();
    await expect(onlyChoice).not.toBeChecked();
  },
};
