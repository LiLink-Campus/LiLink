"use client";

import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_CHANNEL_TYPES,
  EDITABLE_CONTACT_CHANNEL_TYPES,
  type ContactChannelType,
  type EditableContactChannelType,
} from "@lilink/shared";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
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

type ContactAutosaveState = "idle" | "pending" | "saving" | "saved" | "error";

const CONTACT_AUTOSAVE_DELAY_MS = 300;

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
    return "手机号请使用国际格式，例如 +86 138 0013 8000。";
  }

  return null;
}

export function ContactPreferencesEditor({
  initialContactPreferences,
}: {
  initialContactPreferences: ContactPreferencesPayload;
}) {
  const initialContactMethodValues = useMemo(
    () => contactMethodValuesFromPayload(initialContactPreferences),
    [initialContactPreferences],
  );
  const initialContactPayload = useMemo(
    () =>
      buildContactPreferencesSavePayload(
        initialContactPreferences.preferredContactChannel,
        initialContactMethodValues,
      ),
    [
      initialContactMethodValues,
      initialContactPreferences.preferredContactChannel,
    ],
  );
  const [preferredContactChannel, setPreferredContactChannel] =
    useState<ContactChannelType>(initialContactPayload.preferredContactChannel);
  const [contactMethods, setContactMethods] = useState<ContactMethodValues>(
    initialContactMethodValues,
  );
  const [contactSaveError, setContactSaveError] = useState<string | null>(null);
  const [contactSaveState, setContactSaveState] =
    useState<ContactAutosaveState>("idle");
  const [contactManualRetryTick, setContactManualRetryTick] = useState(0);
  const contactAutosaveReady = useRef(false);
  const contactSaveAbortRef = useRef<AbortController | null>(null);
  const contactUnmountedRef = useRef(false);
  const lastSavedContactSnapshotRef = useRef(
    JSON.stringify(initialContactPayload),
  );
  const latestContactSnapshotRef = useRef(
    JSON.stringify(initialContactPayload),
  );
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

  useEffect(() => {
    latestContactSnapshotRef.current = contactSnapshot;
  }, [contactSnapshot]);

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

  const saveContactPreferences = useEffectEvent(
    async (payload: ContactPreferencesSavePayload, snapshot: string) => {
      if (
        contactUnmountedRef.current ||
        snapshot === lastSavedContactSnapshotRef.current
      ) {
        return;
      }

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

        const savedContactMethods = contactMethodValuesFromPayload(result);
        const savedPayload = buildContactPreferencesSavePayload(
          result.preferredContactChannel,
          savedContactMethods,
        );
        lastSavedContactSnapshotRef.current = JSON.stringify(savedPayload);

        if (latestContactSnapshotRef.current === snapshot) {
          setPreferredContactChannel(result.preferredContactChannel);
          setContactMethods(savedContactMethods);
          setContactSaveState("saved");
        }
      } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.name === "AbortError") {
          return;
        }

        if (latestContactSnapshotRef.current !== snapshot) {
          return;
        }

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
    },
  );

  useEffect(() => {
    if (!contactAutosaveReady.current) {
      contactAutosaveReady.current = true;
      return;
    }

    if (contactSnapshot === lastSavedContactSnapshotRef.current) {
      if (contactSaveError) {
        setContactSaveState("idle");
        setContactSaveError(null);
      }
      return;
    }

    if (contactValidationError) {
      contactSaveAbortRef.current?.abort();
      setContactSaveState("error");
      setContactSaveError(contactValidationError);
      return;
    }

    setContactSaveState("pending");
    setContactSaveError(null);

    const timeoutId = window.setTimeout(() => {
      void saveContactPreferences(contactSavePayload, contactSnapshot);
    }, CONTACT_AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    contactSaveError,
    contactSavePayload,
    contactSnapshot,
    contactValidationError,
  ]);

  useEffect(() => {
    if (contactManualRetryTick === 0) {
      return;
    }

    if (contactValidationError) {
      setContactSaveState("error");
      setContactSaveError(contactValidationError);
      return;
    }

    void saveContactPreferences(contactSavePayload, contactSnapshot);
  }, [
    contactManualRetryTick,
    contactSavePayload,
    contactSnapshot,
    contactValidationError,
  ]);

  useEffect(
    () => () => {
      contactUnmountedRef.current = true;
      contactSaveAbortRef.current?.abort();
    },
    [],
  );

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
          <strong>{initialContactPreferences.email}</strong>
        </p>
        <span>不填写其他方式时，引荐后仍展示邮箱。</span>
      </div>

      <div className="contact-method-grid">
        {EDITABLE_CONTACT_CHANNEL_TYPES.map((type) => {
          const invalid =
            contactMethods[type].trim().length > 120 ||
            (type === "PHONE" &&
              contactValidationError?.startsWith("手机号"));

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
              <input
                className="contact-method-input"
                id={buildDashboardFieldId("contact", type)}
                name={`contact-${type}`}
                type={type === "PHONE" ? "tel" : "text"}
                value={contactMethods[type]}
                placeholder={
                  type === "PHONE"
                    ? "+86 138 0013 8000"
                    : `填写${CONTACT_CHANNEL_LABELS[type]}`
                }
                onChange={(event) =>
                  updateContactMethod(type, event.target.value)
                }
              />
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
