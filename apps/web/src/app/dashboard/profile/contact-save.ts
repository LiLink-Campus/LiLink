import { EDITABLE_CONTACT_CHANNEL_TYPES, type ContactChannelType } from "@lilink/shared";
import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import type { ContactPreferencesPayload } from "../_lib/types";

type Methods = ContactPreferencesPayload["methods"];
export type PhoneDraft = { country: CountryCode; number: string };

export function phoneDraftFromValue(value: string): PhoneDraft {
  const phone = parsePhoneNumberFromString(value);
  return phone?.country === "CN"
    ? { country: "CN", number: phone.nationalNumber }
    : { country: "CN", number: value };
}

export function phoneDraftForInput(number: string, country: CountryCode): PhoneDraft {
  const phone = number.trim().startsWith("+") ? parsePhoneNumberFromString(number) : undefined;
  return phone?.country === "CN" && phone.isPossible()
    ? { country: "CN", number: phone.nationalNumber }
    : { country, number };
}

export function phoneDraftValue({ country, number }: PhoneDraft): string {
  const trimmed = number.trim();
  if (!trimmed) return "";
  const phone = parsePhoneNumberFromString(trimmed, country);
  return phone?.isPossible() ? phone.number : trimmed.startsWith("+") ? trimmed : `+${getCountryCallingCode(country)}${trimmed}`;
}

function normalizeMethod(method: Methods[number]): string | null {
  const value = method.value.trim();
  if (value.length > 120) return null;
  if (method.type !== "PHONE") return value;
  const phone = value.startsWith("+") ? parsePhoneNumberFromString(value) : undefined;
  return phone?.country === "CN" && phone.isPossible() ? phone.number : null;
}

export function prepareContactSave(channel: ContactChannelType, drafts: Methods, savedMethods: Methods) {
  const methods: Methods = [];
  for (const type of EDITABLE_CONTACT_CHANNEL_TYPES) {
    const draft = drafts.find((method) => method.type === type);
    const value = draft?.value.trim() ?? "";
    if (!value) {
      if (channel === type) return { payload: null, error: "请填写选中的联系方式，填写后自动保存。" };
      continue;
    }
    const normalized = normalizeMethod({ type, value });
    if (normalized !== null) {
      methods.push({ type, value: normalized });
    } else if (channel === type) {
      return { payload: null, error: type === "PHONE" ? "请填写有效的中国电话号码（+86）。" : "联系方式内容请不要超过 120 个字符。" };
    } else {
      // Preserve the last saved value while an inactive channel has an invalid draft.
      const saved = savedMethods.find((method) => method.type === type);
      if (saved) methods.push(saved);
    }
  }
  return { payload: { preferredContactChannel: channel, methods }, error: null };
}
