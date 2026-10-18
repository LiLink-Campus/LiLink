import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "@/components/ui";
import { SchoolEmailNotice } from "./school-email-notice";

function Preview() {
  const [open, setOpen] = useState(true);
  return <>
    <Button onClick={() => setOpen(true)}>发送验证码</Button>
    <SchoolEmailNotice open={open} onClose={() => setOpen(false)} personalHref="/register/personal" />
  </>;
}

const meta = {
  title: "全站/注册学校列表/普通邮箱提示",
  component: SchoolEmailNotice,
  tags: ["!test"],
  render: () => <Preview />,
} satisfies Meta<typeof SchoolEmailNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = { args: { open: true, onClose: () => {}, personalHref: "/register/personal" } };
