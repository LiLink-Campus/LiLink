import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MemberIdentity, MemberEducationNotice } from "./MemberIdentity";

const meta = { title: "Dashboard/MemberIdentity", component: MemberIdentity, render: args => <div><MemberIdentity {...args} /><MemberEducationNotice educationVerified={args.educationVerified} /></div> } satisfies Meta<typeof MemberIdentity>;
export default meta;
type Story = StoryObj<typeof meta>;
export const VipOrdinary: Story = { args: { vipActive: true, educationVerified: false } };
export const VipEducation: Story = { args: { vipActive: true, educationVerified: true } };
export const Education: Story = { args: { vipActive: false, educationVerified: true } };
export const Ordinary: Story = { args: { vipActive: false, educationVerified: false } };
export const HistoricalUnknown: Story = { args: {} };
