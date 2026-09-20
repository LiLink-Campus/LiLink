import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import TeamMembers from "./team-members";

const meta = {
  title: "Public/About/TeamMembers",
  component: TeamMembers,
  tags: ["smoke"],
  decorators: [(Story) => <div style={{ maxWidth: 880, margin: "auto" }}><Story /></div>],
} satisfies Meta<typeof TeamMembers>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Summary: Story = {
  play: async ({ canvasElement }) => {
    const links = within(canvasElement).getAllByRole("link", { name: "查看介绍 ↗" });
    await expect(links[0]).toHaveAttribute("href", "/about/team/yoryon");
    await expect(links[1]).toHaveAttribute("href", "/about/team/member-02");
  },
};
