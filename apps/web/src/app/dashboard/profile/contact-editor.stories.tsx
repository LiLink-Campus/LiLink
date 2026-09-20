import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor } from "storybook/test";
import { http, HttpResponse } from "msw";
import { ContactEditor } from "./contact-editor";
import styles from "./profile-redesign.module.css";
import type { ContactPreferencesPayload } from "../_lib/types";

const email = "contact-story@example.test";
const userId = "contact-story-user";
const initial: ContactPreferencesPayload = { revision: 0, email, preferredContactChannel: "EMAIL", methods: [] };
const savedPhone: ContactPreferencesPayload = { revision: 0, email, preferredContactChannel: "PHONE", methods: [{ type: "PHONE", value: "+8613800138000" }] };
const apiUrl = "http://localhost:4000/v1/me/contact-preferences";
const savedRequest = fn();
const successHandler = http.put(apiUrl, async ({ request }) => {
  const payload = await request.json() as { revision: number };
  savedRequest(payload);
  return HttpResponse.json({ email, ...payload, revision: payload.revision + 1 });
});

const meta = {
  title: "Dashboard/Profile/ContactEditor",
  component: ContactEditor,
  tags: ["smoke"],
  args: { initial, userId, email, onStatus: fn() },
  decorators: [(Story) => <div className={styles.page} style={{ padding: 16 }}><div className={styles.selfFlat}><Story /></div></div>],
  parameters: { msw: { handlers: { contact: [http.get(apiUrl, () => HttpResponse.json(initial)), successHandler], site: [] } } },
  beforeEach: () => { savedRequest.mockClear(); sessionStorage.removeItem(`lilink:contact-draft:v2:${userId}`); sessionStorage.removeItem(`lilink:contact-draft:${email}`); },
} satisfies Meta<typeof ContactEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NavigationSaveFailure: Story = {
  render: (args) => <><ContactEditor {...args} /><a href="/dashboard">返回首页</a></>,
  parameters: { msw: { handlers: { contact: [http.put(apiUrl, () => HttpResponse.json({ message: "联系方式保存失败，请重试。" }, { status: 503 }))], site: [] } } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "微信" }));
    await userEvent.type(canvas.getByLabelText("微信内容"), "navigation_draft");
    await userEvent.click(canvas.getByRole("link", { name: "返回首页" }));
    await expect(await canvas.findByRole("button", { name: "重试保存" })).toBeVisible();
    await expect(canvas.getByText("联系方式保存后将继续跳转。请先完成填写或重试保存。")).toBeVisible();
    await expect(canvas.getByLabelText("微信内容")).toHaveValue("navigation_draft");
  },
};

export const RestoredDraftConflict: Story = {
  beforeEach: () => {
    sessionStorage.setItem(`lilink:contact-draft:v2:${userId}`, JSON.stringify({ revision: 99, preferredContactChannel: "WECHAT", methods: [{ type: "WECHAT", value: "restored_unsaved_draft" }] }));
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByLabelText("微信内容")).toHaveValue("restored_unsaved_draft");
    await expect(canvas.getByRole("button", { name: "重试保存" })).toBeVisible();
    await expect(savedRequest).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "重试保存" }));
    await expect(await canvas.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
    await expect(savedRequest).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 0, methods: [{ type: "WECHAT", value: "restored_unsaved_draft" }] }));
  },
};

export const ReusedEmailDraftIsolation: Story = {
  beforeEach: () => {
    const draft = JSON.stringify({ revision: 0, preferredContactChannel: "WECHAT", methods: [{ type: "WECHAT", value: "retired_account_private_contact" }] });
    sessionStorage.setItem(`lilink:contact-draft:${email}`, draft);
    sessionStorage.setItem("lilink:contact-draft:v2:retired-account-id", draft);
    return () => {
      sessionStorage.removeItem(`lilink:contact-draft:${email}`);
      sessionStorage.removeItem("lilink:contact-draft:v2:retired-account-id");
    };
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radio", { name: "邮箱" })).toBeChecked();
    await expect(canvas.getByLabelText("邮箱内容")).toHaveValue(email);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await expect(savedRequest).not.toHaveBeenCalled();
    await expect(canvas.queryByLabelText("微信内容")).not.toBeInTheDocument();
  },
};

export const ChinaPhoneAutosave: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "电话" }));
    await expect(canvas.queryByRole("button", { name: /电话区号/ })).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 600));
    await expect(savedRequest).not.toHaveBeenCalled();
    await userEvent.type(canvas.getByLabelText("电话内容"), "13800138000");
    await waitFor(() => expect(savedRequest).toHaveBeenLastCalledWith(expect.objectContaining({ preferredContactChannel: "PHONE", methods: [{ type: "PHONE", value: "+8613800138000" }] })));
    await expect(await canvas.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
  },
};

export const SavedChinaPhone: Story = {
  args: { initial: savedPhone },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("电话内容")).toHaveValue("13800138000");
    await expect(canvas.queryByRole("button", { name: /电话区号/ })).not.toBeInTheDocument();
  },
};

export const InvalidHiddenPhone: Story = {
  args: { initial: savedPhone },
  play: async ({ canvas, userEvent }) => {
    await userEvent.clear(canvas.getByLabelText("电话内容"));
    await userEvent.type(canvas.getByLabelText("电话内容"), "123");
    await expect(canvas.getByText("请填写有效的中国电话号码（+86）。")).toBeVisible();
    await userEvent.click(canvas.getByRole("radio", { name: "邮箱" }));
    await waitFor(() => expect(savedRequest).toHaveBeenLastCalledWith(expect.objectContaining({ preferredContactChannel: "EMAIL", methods: savedPhone.methods })));
    await userEvent.click(canvas.getByRole("radio", { name: "微信" }));
    await userEvent.type(canvas.getByLabelText("微信内容"), "story_wechat");
    await waitFor(() => expect(savedRequest).toHaveBeenLastCalledWith(expect.objectContaining({ preferredContactChannel: "WECHAT", methods: [{ type: "WECHAT", value: "story_wechat" }, ...savedPhone.methods] })));
    await expect(await canvas.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
  },
};

export const ServerValidationAndRetry: Story = {
  parameters: { msw: { handlers: { contact: [
    http.put(apiUrl, () => HttpResponse.json({ message: "Phone number must use international format." }, { status: 400 }), { once: true }),
    http.get(apiUrl, () => HttpResponse.json(initial)),
    successHandler,
  ], site: [] } } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "电话" }));
    await userEvent.type(canvas.getByLabelText("电话内容"), "13800138000");
    await expect(await canvas.findByText("手机号请使用国际格式，例如 中国 +86 138 0013 8000。")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "重试保存" }));
    await expect(await canvas.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
  },
};


export const ConflictingPageAndRetry: Story = {
  parameters: { msw: { handlers: { contact: [
    http.put(apiUrl, () => HttpResponse.json({ message: "Contact preferences have changed. Reload before saving again." }, { status: 409 }), { once: true }),
    http.get(apiUrl, () => HttpResponse.json({ ...initial, revision: 7 })),
    successHandler,
  ], site: [] } } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "微信" }));
    await userEvent.type(canvas.getByLabelText("微信内容"), "my_current_draft");
    await expect(await canvas.findByText("联系方式已在其他页面更新。当前填写内容已保留；点击“重试保存”可用当前内容覆盖。")).toBeVisible();
    await expect(canvas.getByLabelText("微信内容")).toHaveValue("my_current_draft");
    await userEvent.click(canvas.getByRole("button", { name: "重试保存" }));
    await expect(await canvas.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
    await expect(savedRequest).toHaveBeenLastCalledWith({ revision: 7, preferredContactChannel: "WECHAT", methods: [{ type: "WECHAT", value: "my_current_draft" }] });
  },
};

let staleSaveStarted = false;
let releaseStaleSave: (() => void) | undefined;
let raceStored = initial;
let raceRequestCount = 0;

function RemountContactEditor() {
  const [page, setPage] = useState(0);
  return <>
    <button type="button" onClick={() => setPage((current) => current + 1)}>模拟离开后重新进入资料</button>
    <ContactEditor key={page} initial={initial} userId={userId} email={email} onStatus={fn()} />
  </>;
}

export const RemountWhileSaving: Story = {
  render: () => <RemountContactEditor />,
  beforeEach: () => {
    staleSaveStarted = false;
    raceStored = initial;
    raceRequestCount = 0;
    releaseStaleSave = undefined;
    savedRequest.mockClear();
    return () => releaseStaleSave?.();
  },
  parameters: { msw: { handlers: { contact: [
    http.put(apiUrl, async ({ request }) => {
      const payload = await request.json() as Omit<ContactPreferencesPayload, "email">;
      raceRequestCount += 1;
      if (raceRequestCount === 1) {
        staleSaveStarted = true;
        await new Promise<void>((resolve) => { releaseStaleSave = resolve; });
      }
      if (payload.revision !== raceStored.revision) {
        return HttpResponse.json({ message: "Contact preferences have changed. Reload before saving again." }, { status: 409 });
      }
      raceStored = { email, ...payload, revision: payload.revision + 1 };
      return HttpResponse.json(raceStored);
    }),
  ], site: [] } } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "微信" }));
    await userEvent.type(canvas.getByLabelText("微信内容"), "old_page_value");
    await waitFor(() => expect(staleSaveStarted).toBe(true));
    await userEvent.click(canvas.getByRole("button", { name: "模拟离开后重新进入资料" }));
    await userEvent.click(canvas.getByRole("radio", { name: "微信" }));
    await expect(canvas.getByLabelText("微信内容")).toHaveValue("old_page_value");
    await userEvent.clear(canvas.getByLabelText("微信内容"));
    await userEvent.type(canvas.getByLabelText("微信内容"), "new_page_value");
    await expect(await canvas.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
    releaseStaleSave?.();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(raceStored).toMatchObject({ revision: 1, methods: [{ type: "WECHAT", value: "new_page_value" }] });
    await expect(canvas.getByLabelText("微信内容")).toHaveValue("new_page_value");
    await expect(canvas.getByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
  },
};

function conflictingServer(start: ContactPreferencesPayload, loseFirstResponse = false, beforeFirstResponse?: () => Promise<void>) {
  const remote: ContactPreferencesPayload = { ...start, revision: 1, preferredContactChannel: "WECHAT", methods: [{ type: "WECHAT", value: "other_page_value" }] };
  let stored = loseFirstResponse ? start : remote;
  const requests = fn();
  return {
    requests,
    stored: () => stored,
    reset: () => { stored = loseFirstResponse ? start : remote; requests.mockClear(); },
    handlers: [
      http.get(apiUrl, () => HttpResponse.json(stored)),
      http.put(apiUrl, async ({ request }) => {
        const payload = await request.json() as Omit<ContactPreferencesPayload, "email">;
        requests(payload);
        if (requests.mock.calls.length === 1) await beforeFirstResponse?.();
        if (payload.revision !== stored.revision) {
          return HttpResponse.json({ message: "Contact preferences have changed. Reload before saving again." }, { status: 409 });
        }
        stored = { email, ...payload, revision: payload.revision + 1 };
        if (loseFirstResponse && requests.mock.calls.length === 1) return HttpResponse.error();
        return HttpResponse.json(stored);
      }),
    ],
  };
}

const initialWechat: ContactPreferencesPayload = { ...initial, preferredContactChannel: "WECHAT", methods: [{ type: "WECHAT", value: "initial_value" }] };
const restoreValueServer = conflictingServer(initialWechat);
const restoreEmailServer = conflictingServer(initial);
const lostResponseServer = conflictingServer(initialWechat, true);
const conflictMessage = "联系方式已在其他页面更新。当前填写内容已保留；点击“重试保存”可用当前内容覆盖。";

export const ConflictThenRestoreOriginalValue: Story = {
  args: { initial: initialWechat },
  beforeEach: restoreValueServer.reset,
  parameters: { msw: { handlers: { contact: restoreValueServer.handlers, site: [] } } },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByLabelText("微信内容");
    await userEvent.clear(input);
    await userEvent.type(input, "my_new_draft");
    await expect(await canvas.findByText(conflictMessage)).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "initial_value");
    await new Promise((resolve) => setTimeout(resolve, 600));
    await expect(canvas.getByText(conflictMessage)).toBeVisible();
    await expect(canvas.queryByText("已自动保存 · 匹配成功后向对方展示")).not.toBeInTheDocument();
    await expect(restoreValueServer.requests).toHaveBeenCalledTimes(1);
    await expect(restoreValueServer.stored().methods[0].value).toBe("other_page_value");
    await userEvent.click(canvas.getByRole("button", { name: "重试保存" }));
    await expect(await canvas.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
    await expect(restoreValueServer.stored()).toMatchObject({ revision: 2, methods: initialWechat.methods });
  },
};

export const ConflictThenRestoreEmail: Story = {
  beforeEach: restoreEmailServer.reset,
  parameters: { msw: { handlers: { contact: restoreEmailServer.handlers, site: [] } } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "微信" }));
    await userEvent.type(canvas.getByLabelText("微信内容"), "my_new_draft");
    await expect(await canvas.findByText(conflictMessage)).toBeVisible();
    await userEvent.clear(canvas.getByLabelText("微信内容"));
    await userEvent.click(canvas.getByRole("radio", { name: "邮箱" }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    await expect(canvas.getByText(conflictMessage)).toBeVisible();
    await expect(canvas.queryByText("已自动保存 · 匹配成功后向对方展示")).not.toBeInTheDocument();
    await expect(restoreEmailServer.requests).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole("button", { name: "重试保存" }));
    await expect(await canvas.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
    await expect(restoreEmailServer.stored()).toMatchObject({ revision: 2, preferredContactChannel: "EMAIL", methods: [] });
  },
};

export const CommittedSaveWithLostResponse: Story = {
  args: { initial: initialWechat },
  beforeEach: lostResponseServer.reset,
  parameters: { msw: { handlers: { contact: lostResponseServer.handlers, site: [] } } },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByLabelText("微信内容");
    await userEvent.clear(input);
    await userEvent.type(input, "committed_but_response_lost");
    await expect(await canvas.findByRole("button", { name: "重试保存" })).toBeVisible();
    await expect(lostResponseServer.stored().methods[0].value).toBe("committed_but_response_lost");
    await userEvent.clear(input);
    await userEvent.type(input, "initial_value");
    await new Promise((resolve) => setTimeout(resolve, 600));
    await expect(canvas.queryByText("已自动保存 · 匹配成功后向对方展示")).not.toBeInTheDocument();
    await expect(lostResponseServer.requests).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole("button", { name: "重试保存" }));
    await expect(await canvas.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
    await expect(lostResponseServer.stored()).toMatchObject({ revision: 2, methods: initialWechat.methods });
  },
};


let releaseLateConflict = () => {};
const lateConflictServer = conflictingServer(initialWechat, false, () => new Promise<void>((resolve) => { releaseLateConflict = resolve; }));

export const RestoreBeforeConflictResponse: Story = {
  args: { initial: initialWechat },
  beforeEach: () => { lateConflictServer.reset(); return () => releaseLateConflict(); },
  parameters: { msw: { handlers: { contact: lateConflictServer.handlers, site: [] } } },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByLabelText("微信内容");
    await userEvent.clear(input);
    await userEvent.type(input, "pending_old_draft");
    await waitFor(() => expect(lateConflictServer.requests).toHaveBeenCalledTimes(1));
    await userEvent.clear(input);
    await userEvent.type(input, "initial_value");
    await new Promise((resolve) => setTimeout(resolve, 600));
    releaseLateConflict();
    await expect(await canvas.findByText(conflictMessage)).toBeVisible();
    await expect(canvas.queryByText("已自动保存 · 匹配成功后向对方展示")).not.toBeInTheDocument();
    await expect(lateConflictServer.requests).toHaveBeenCalledTimes(1);
    await expect(lateConflictServer.stored().methods[0].value).toBe("other_page_value");
    await userEvent.click(canvas.getByRole("button", { name: "重试保存" }));
    await expect(await canvas.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
    await expect(lateConflictServer.stored()).toMatchObject({ revision: 2, methods: initialWechat.methods });
  },
};
