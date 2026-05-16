export const CONTACT_CHANNEL_TYPES = [
  "EMAIL",
  "WECHAT",
  "QQ",
  "PHONE",
] as const;

export type ContactChannelType = (typeof CONTACT_CHANNEL_TYPES)[number];

export const EDITABLE_CONTACT_CHANNEL_TYPES = ["WECHAT", "QQ", "PHONE"] as const;

export type EditableContactChannelType =
  (typeof EDITABLE_CONTACT_CHANNEL_TYPES)[number];

export const CONTACT_CHANNEL_LABELS: Record<ContactChannelType, string> = {
  EMAIL: "邮箱",
  WECHAT: "微信号",
  QQ: "QQ 号",
  PHONE: "手机号",
};

export function contactChannelLabel(type: ContactChannelType) {
  return CONTACT_CHANNEL_LABELS[type];
}
