"use client";

import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_CHANNEL_TYPES,
  EDITABLE_CONTACT_CHANNEL_TYPES,
  type ContactChannelType,
  type EditableContactChannelType,
} from "@lilink/shared";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { buildDashboardFieldId } from "../_lib/format";
import type { ContactPreferencesPayload } from "../_lib/types";

type ContactMethodValues = Record<EditableContactChannelType, string>;

type ContactPreferencesSavePayload = {
  preferredContactChannel: ContactChannelType;
  methods: Array<{
    type: EditableContactChannelType;
    value: string;
  }>;
};

type ContactPreferencesEditorState = {
  email: string;
  preferredContactChannel: ContactChannelType;
  contactMethods: ContactMethodValues;
  snapshot: string;
};

type ContactAutosaveState = "idle" | "pending" | "saving" | "saved" | "error";

const CONTACT_AUTOSAVE_DELAY_MS = 300;
const DEFAULT_PHONE_COUNTRY_CODE = "+86";
const DEFAULT_PHONE_COUNTRY_LABEL = "中国 +86";

const EMPTY_CONTACT_METHOD_VALUES: ContactMethodValues = {
  WECHAT: "",
  QQ: "",
  PHONE: "",
};

function contactMethodValuesFromPayload(
  payload: ContactPreferencesPayload,
): ContactMethodValues {
  const values = { ...EMPTY_CONTACT_METHOD_VALUES };

  for (const method of payload.methods) {
    values[method.type] = method.value;
  }

  return values;
}

function buildContactPreferencesSavePayload(
  preferredContactChannel: ContactChannelType,
  contactMethods: ContactMethodValues,
): ContactPreferencesSavePayload {
  return {
    preferredContactChannel,
    methods: EDITABLE_CONTACT_CHANNEL_TYPES.flatMap((type) => {
      const value = contactMethods[type].trim();
      return value ? [{ type, value }] : [];
    }),
  };
}

function buildContactPreferencesEditorState(
  payload: ContactPreferencesPayload,
): ContactPreferencesEditorState {
  const contactMethods = contactMethodValuesFromPayload(payload);
  const savePayload = buildContactPreferencesSavePayload(
    payload.preferredContactChannel,
    contactMethods,
  );

  return {
    email: payload.email,
    preferredContactChannel: savePayload.preferredContactChannel,
    contactMethods,
    snapshot: JSON.stringify(savePayload),
  };
}

function parseContactPreferencesSaveSnapshot(
  snapshot: string,
): ContactPreferencesSavePayload {
  return JSON.parse(snapshot) as ContactPreferencesSavePayload;
}

function phoneInputValueFromContactValue(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith(DEFAULT_PHONE_COUNTRY_CODE)) {
    return trimmed.slice(DEFAULT_PHONE_COUNTRY_CODE.length).trimStart();
  }

  return value;
}

function contactValueFromPhoneInputValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith("+")) {
    return value;
  }

  return `${DEFAULT_PHONE_COUNTRY_CODE} ${trimmed}`;
}

function contactInputValue(type: EditableContactChannelType, value: string) {
  if (type === "PHONE") {
    return phoneInputValueFromContactValue(value);
  }

  return value;
}

function contactValueFromInput(
  type: EditableContactChannelType,
  value: string,
) {
  if (type === "PHONE") {
    return contactValueFromPhoneInputValue(value);
  }

  return value;
}

function contactAutosaveStatusText(saveState: ContactAutosaveState) {
  if (saveState === "pending") {
    return "准备保存…";
  }

  if (saveState === "saving") {
    return "联系方式正在保存…";
  }

  if (saveState === "saved") {
    return "联系方式已保存。";
  }

  if (saveState === "error") {
    return "联系方式保存失败，请查看提示。";
  }

  return "联系方式会自动保存。";
}

function contactValidationMessage(contactMethods: ContactMethodValues) {
  for (const type of EDITABLE_CONTACT_CHANNEL_TYPES) {
    if (contactMethods[type].trim().length > 120) {
      return `${CONTACT_CHANNEL_LABELS[type]}内容过长。`;
    }
  }

  const phone = contactMethods.PHONE.trim();
  if (phone && !phone.startsWith("+")) {
    return "手机号请使用国际格式，例如 中国 +86 138 0013 8000。";
  }

  return null;
}

export function ContactPreferencesEditor({
  initialContactPreferences,
}: {
  initialContactPreferences: ContactPreferencesPayload;
}) {
  const initialContactState = useMemo(
    () => buildContactPreferencesEditorState(initialContactPreferences),
    [initialContactPreferences],
  );
  const [contactEmail, setContactEmail] = useState(initialContactState.email);
  const [preferredContactChannel, setPreferredContactChannel] =
    useState<ContactChannelType>(initialContactState.preferredContactChannel);
  const [contactMethods, setContactMethods] = useState<ContactMethodValues>(
    initialContactState.contactMethods,
  );
  const [contactSaveError, setContactSaveError] = useState<string | null>(null);
  const [contactSaveState, setContactSaveState] =
    useState<ContactAutosaveState>("idle");
  const [contactManualRetryTick, setContactManualRetryTick] = useState(0);
  const contactAutosaveReady = useRef(false);
  const contactSaveAbortRef = useRef<AbortController | null>(null);
  const contactUnmountedRef = useRef(false);
  const lastFailedContactSnapshotRef = useRef<string | null>(null);
  const lastHandledContactManualRetryTickRef = useRef(0);
  const lastSavedContactSnapshotRef = useRef(initialContactState.snapshot);
  const latestContactSnapshotRef = useRef(initialContactState.snapshot);
  const contactSavePayload = useMemo(
    () =>
      buildContactPreferencesSavePayload(
        preferredContactChannel,
        contactMethods,
      ),
    [contactMethods, preferredContactChannel],
  );
  const contactSnapshot = useMemo(
    () => JSON.stringify(contactSavePayload),
    [contactSavePayload],
  );
  const contactValidationError = useMemo(
    () => contactValidationMessage(contactMethods),
    [contactMethods],
  );
  const contactStatus = contactAutosaveStatusText(contactSaveState);

  const resetContactPreferences = useEffectEvent(
    (payload: ContactPreferencesPayload) => {
      const nextState = buildContactPreferencesEditorState(payload);
      contactSaveAbortRef.current?.abort();
      lastFailedContactSnapshotRef.current = null;
      lastSavedContactSnapshotRef.current = nextState.snapshot;
      latestContactSnapshotRef.current = nextState.snapshot;
      setContactEmail(nextState.email);
      setPreferredContactChannel(nextState.preferredContactChannel);
      setContactMethods(nextState.contactMethods);
      setContactSaveState("idle");
      setContactSaveError(null);
    },
  );

  useEffect(() => {
    latestContactSnapshotRef.current = contactSnapshot;
  }, [contactSnapshot]);

  useEffect(() => {
    if (
      latestContactSnapshotRef.current !== lastSavedContactSnapshotRef.current
    ) {
      return;
    }

    resetContactPreferences(initialContactPreferences);
  }, [initialContactPreferences]);

  useEffect(() => {
    const abortController = new AbortController();
    const baselineSnapshot = lastSavedContactSnapshotRef.current;

    void fetchApi<ContactPreferencesPayload>("/me/contact-preferences", {
      signal: abortController.signal,
    })
      .then((payload) => {
        if (
          contactUnmountedRef.current ||
          abortController.signal.aborted ||
          latestContactSnapshotRef.current !== baselineSnapshot ||
          lastSavedContactSnapshotRef.current !== baselineSnapshot
        ) {
          return;
        }

        resetContactPreferences(payload);
      })
      .catch((caughtError) => {
        if (caughtError instanceof Error && caughtError.name === "AbortError") {
          return;
        }
      });

    return () => {
      abortController.abort();
    };
  }, []);

  function updateContactMethod(
    type: EditableContactChannelType,
    value: string,
  ) {
    setContactMethods((current) => ({
      ...current,
      [type]: value,
    }));

    if (preferredContactChannel === type && value.trim().length === 0) {
      setPreferredContactChannel("EMAIL");
    }
  }

  function choosePreferredContactChannel(type: ContactChannelType) {
    if (type !== "EMAIL" && contactMethods[type].trim().length === 0) {
      return;
    }

    setPreferredContactChannel(type);
  }

  const saveContactPreferences = useEffectEvent(async (snapshot: string) => {
    if (
      contactUnmountedRef.current ||
      snapshot === lastSavedContactSnapshotRef.current
    ) {
      return;
    }

    const payload = parseContactPreferencesSaveSnapshot(snapshot);
    contactSaveAbortRef.current?.abort();
    const abortController = new AbortController();
    contactSaveAbortRef.current = abortController;
    setContactSaveState("saving");
    setContactSaveError(null);

    try {
      const result = await fetchApi<ContactPreferencesPayload>(
        "/me/contact-preferences",
        {
          method: "PUT",
          body: JSON.stringify(payload),
          signal: abortController.signal,
        },
      );

      if (contactUnmountedRef.current) {
        return;
      }

      if (latestContactSnapshotRef.current !== snapshot) {
        return;
      }

      const savedState = buildContactPreferencesEditorState(result);
      lastSavedContactSnapshotRef.current = savedState.snapshot;
      latestContactSnapshotRef.current = savedState.snapshot;
      lastFailedContactSnapshotRef.current = null;
      setContactEmail(savedState.email);
      setPreferredContactChannel(savedState.preferredContactChannel);
      setContactMethods(savedState.contactMethods);
      setContactSaveState("saved");
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.name === "AbortError") {
        return;
      }

      if (latestContactSnapshotRef.current !== snapshot) {
        return;
      }

      lastFailedContactSnapshotRef.current = snapshot;
      setContactSaveState("error");
      setContactSaveError(
        caughtError instanceof Error
          ? caughtError.message
          : "联系方式保存失败。",
      );
    } finally {
      if (contactSaveAbortRef.current === abortController) {
        contactSaveAbortRef.current = null;
      }
    }
  });

  useEffect(() => {
    if (!contactAutosaveReady.current) {
      contactAutosaveReady.current = true;
      return;
    }

    if (contactSnapshot === lastSavedContactSnapshotRef.current) {
      lastFailedContactSnapshotRef.current = null;
      contactSaveAbortRef.current?.abort();
      setContactSaveState((current) =>
        current === "idle" || current === "saved" ? current : "idle",
      );
      setContactSaveError((current) => (current == null ? current : null));
      return;
    }

    if (contactValidationError) {
      contactSaveAbortRef.current?.abort();
      setContactSaveState("error");
      setContactSaveError(contactValidationError);
      return;
    }

    if (contactSnapshot === lastFailedContactSnapshotRef.current) {
      return;
    }

    lastFailedContactSnapshotRef.current = null;
    setContactSaveState("pending");
    setContactSaveError(null);

    const timeoutId = window.setTimeout(() => {
      void saveContactPreferences(contactSnapshot);
    }, CONTACT_AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [contactSnapshot, contactValidationError]);

  useEffect(() => {
    if (
      contactManualRetryTick === 0 ||
      contactManualRetryTick === lastHandledContactManualRetryTickRef.current
    ) {
      return;
    }

    lastHandledContactManualRetryTickRef.current = contactManualRetryTick;

    if (contactValidationError) {
      setContactSaveState("error");
      setContactSaveError(contactValidationError);
      return;
    }

    lastFailedContactSnapshotRef.current = null;
    void saveContactPreferences(contactSnapshot);
  }, [contactManualRetryTick, contactSnapshot, contactValidationError]);

  useEffect(() => {
    contactUnmountedRef.current = false;

    return () => {
      contactUnmountedRef.current = true;
      contactSaveAbortRef.current?.abort();
    };
  }, []);

  return (
    <section className="app-card contact-preferences-card">
      <div className="app-card-head">
        <div>
          <h2 className="app-card-title">展示给对方的联系方式</h2>
          <p className="app-card-muted">
            引荐成功后，系统会把你选择公开的一种联系方式发给对方。
          </p>
        </div>
      </div>

      <div className="contact-preferences-summary">
        <p>
          当前注册邮箱
          <strong>{contactEmail}</strong>
        </p>
        <span>不填写其他方式时，引荐后仍展示邮箱。</span>
      </div>

      <div className="contact-method-grid">
        {EDITABLE_CONTACT_CHANNEL_TYPES.map((type) => {
          const invalid =
            contactMethods[type].trim().length > 120 ||
            (type === "PHONE" && contactValidationError?.startsWith("手机号"));
          const inputId = buildDashboardFieldId("contact", type);
          const phoneCountryCodeId = buildDashboardFieldId(
            "contact-country-code",
            type,
          );
          const input = (
            <input
              aria-describedby={
                type === "PHONE" ? phoneCountryCodeId : undefined
              }
              autoComplete={type === "PHONE" ? "tel-national" : undefined}
              className="contact-method-input"
              id={inputId}
              inputMode={type === "PHONE" ? "tel" : undefined}
              name={`contact-${type}`}
              type={type === "PHONE" ? "tel" : "text"}
              value={contactInputValue(type, contactMethods[type])}
              placeholder={
                type === "PHONE"
                  ? "138 0013 8000"
                  : `填写${CONTACT_CHANNEL_LABELS[type]}`
              }
              onChange={(event) =>
                updateContactMethod(
                  type,
                  contactValueFromInput(type, event.target.value),
                )
              }
            />
          );

          return (
            <label
              key={type}
              className={
                invalid
                  ? "contact-method-field is-invalid"
                  : "contact-method-field"
              }
            >
              <span className="contact-method-label">
                {CONTACT_CHANNEL_LABELS[type]}
              </span>
              {type === "PHONE" ? (
                <span className="contact-phone-input-shell">
                  <span
                    className="contact-phone-country-code"
                    id={phoneCountryCodeId}
                  >
                    {DEFAULT_PHONE_COUNTRY_LABEL}
                  </span>
                  {input}
                </span>
              ) : (
                input
              )}
            </label>
          );
        })}
      </div>

      <div
        className="contact-channel-options"
        role="radiogroup"
        aria-label="公开联系方式"
      >
        <span className="contact-channel-options-label">公开给对方</span>
        {CONTACT_CHANNEL_TYPES.map((type) => {
          const contactMethodValue =
            type === "EMAIL" ? "" : contactMethods[type];
          const disabled =
            type !== "EMAIL" && contactMethodValue.trim().length === 0;

          return (
            <label
              key={type}
              className={
                disabled
                  ? "contact-channel-option is-disabled"
                  : "contact-channel-option"
              }
            >
              <input
                checked={preferredContactChannel === type}
                disabled={disabled}
                id={buildDashboardFieldId("preferred-contact", type)}
                type="radio"
                name="preferredContactChannel"
                onChange={() => choosePreferredContactChannel(type)}
              />
              <span>{CONTACT_CHANNEL_LABELS[type]}</span>
            </label>
          );
        })}
      </div>

      {contactSaveError ? (
        <div className="contact-save-status is-error">
          <p role="alert">{contactSaveError}</p>
          <button
            className="button-secondary"
            type="button"
            onClick={() => setContactManualRetryTick((current) => current + 1)}
          >
            立即重试
          </button>
        </div>
      ) : (
        <p
          aria-atomic="true"
          aria-live="polite"
          className={
            contactSaveState === "saved"
              ? "contact-save-status is-saved"
              : "contact-save-status"
          }
          role="status"
        >
          {contactStatus}
        </p>
      )}
    </section>
  );
}
