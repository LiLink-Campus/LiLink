import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, waitFor, within } from "storybook/test";
import { PhoneCountryPicker } from "./phone-country-picker";

const submitted = fn();
function Example(args: React.ComponentProps<typeof PhoneCountryPicker>) {
  const [value, setValue] = useState(args.value);
  return <form style={{ width: 150, margin: 24 }} onSubmit={(event) => { event.preventDefault(); submitted(); }}>
    <PhoneCountryPicker value={value} onChange={(country) => { setValue(country); args.onChange(country); }} />
  </form>;
}

const meta = {
  title: "Dashboard/Profile/PhoneCountryPicker",
  component: PhoneCountryPicker,
  tags: ["smoke"],
  args: { value: "CN", onChange: fn() },
  render: (args) => <Example {...args} />,
  beforeEach: () => { submitted.mockClear(); },
} satisfies Meta<typeof PhoneCountryPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FourCharacterRegion: Story = { args: { value: "HK" } };
export const LongRegionName: Story = { args: { value: "CC" } };

export const CommonRegions: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "电话区号：中国 +86" }));
    const dialog = within(canvas.getByRole("dialog", { name: "选择电话区号" }));
    await expect(dialog.getByRole("searchbox", { name: "搜索国家、地区或区号" })).toHaveFocus();
    const common = within(dialog.getByRole("list", { name: "常用国家和地区" }));
    await expect(common.getAllByRole("button")[0]).toHaveTextContent("中国");
    await expect(common.getByRole("button", { name: "中国 +86", pressed: true })).toBeVisible();
    await expect(common.getByRole("button", { name: "美国 +1" })).toBeInTheDocument();
    await expect(common.getByRole("button", { name: "加拿大 +1" })).toBeInTheDocument();
  },
};

export const SearchAndKeyboardSelection: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "电话区号：中国 +86" }));
    const search = canvas.getByRole("searchbox", { name: "搜索国家、地区或区号" });
    await fireEvent.keyDown(search, { key: "Enter", isComposing: true, keyCode: 229 });
    await expect(canvas.getByRole("dialog")).toBeVisible();
    await expect(search).toHaveFocus();
    await userEvent.type(search, "加拿大");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "电话区号：加拿大 +1" })).toHaveFocus());
    await expect(args.onChange).toHaveBeenLastCalledWith("CA");
    await expect(submitted).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "电话区号：加拿大 +1" }));
    await userEvent.type(canvas.getByRole("searchbox"), "+1");
    const result = within(canvas.getByRole("list", { name: "区号搜索结果" }));
    await expect(result.getByRole("button", { name: "美国 +1" })).toBeVisible();
    await expect(result.getByRole("button", { name: "加拿大 +1" })).toBeVisible();
    await userEvent.keyboard("{ArrowDown}");
    await expect(result.getByRole("button", { name: "美国 +1" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "电话区号：加拿大 +1" })).toHaveFocus());
    await expect(submitted).not.toHaveBeenCalled();
  },
};

export const EmptySearchAndClose: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "电话区号：中国 +86" });
    await userEvent.click(trigger);
    const initialBounds = canvas.getByRole("dialog").getBoundingClientRect();
    await userEvent.type(canvas.getByRole("searchbox"), "zzzz-no-region");
    await expect(canvas.getByText("没有找到相关区号")).toBeVisible();
    await expect(canvas.getByRole("dialog").getBoundingClientRect().top).toBe(initialBounds.top);
    await expect(canvas.getByRole("dialog").getBoundingClientRect().height).toBe(initialBounds.height);
    await userEvent.keyboard("{Enter}");
    await expect(submitted).not.toHaveBeenCalled();
    await expect(canvas.getByRole("dialog")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "清空区号搜索" }));
    await expect(canvas.getByRole("searchbox")).toHaveFocus();
    await userEvent.type(canvas.getByRole("searchbox"), "Singapore");
    await expect(canvas.getByRole("button", { name: "新加坡 +65" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await expect(canvas.getByRole("searchbox")).toHaveValue("");
    await userEvent.type(canvas.getByRole("searchbox"), "CA");
    await expect(canvas.getByRole("list", { name: "区号搜索结果" }).querySelectorAll("button")).toHaveLength(1);
    await expect(canvas.getByRole("button", { name: "加拿大 +1" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "关闭区号选择" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const MobileSheet: Story = {
  ...CommonRegions,
  globals: { viewport: { value: "mobile407" } },
};
