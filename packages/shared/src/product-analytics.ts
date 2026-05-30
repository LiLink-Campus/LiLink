export const PRODUCT_EVENT_KINDS = [
  "footprint",
  "intent",
  "outcome",
  "performance",
  "frustration",
] as const;

export type ProductEventKind = (typeof PRODUCT_EVENT_KINDS)[number];

export const BROWSER_PRODUCT_EVENT_KINDS = ["footprint", "intent"] as const;

export type BrowserProductEventKind =
  (typeof BROWSER_PRODUCT_EVENT_KINDS)[number];

export const PRODUCT_EVENT_SOURCES = ["web", "api", "server"] as const;

export type ProductEventSource = (typeof PRODUCT_EVENT_SOURCES)[number];

export const PRODUCT_EVENT_ENTITY_TYPES = [
  "coupon",
  "match",
  "meetup_session",
  "meetup_proposal",
] as const;

export type ProductEventEntityType =
  (typeof PRODUCT_EVENT_ENTITY_TYPES)[number];

export const PRODUCT_EVENT_NAMES = [
  "dashboard_page_viewed",
  "match_page_viewed",
  "match_contact_request_clicked",
  "match_contact_requested",
  "coupon_page_viewed",
  "coupon_redeem_code_open_clicked",
  "coupon_redeem_code_displayed",
  "coupon_redeemed",
  "meetup_entry_clicked",
  "meetup_flow_viewed",
  "meetup_session_created",
  "meetup_proposal_submit_clicked",
  "meetup_proposal_created",
  "meetup_option_accept_clicked",
  "meetup_option_accepted",
  "meetup_final_confirm_clicked",
  "meetup_final_confirmed",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export type ProductEventDefinition = {
  kind: ProductEventKind;
  browserWritable: boolean;
  entityTypes: readonly ProductEventEntityType[];
  metadataKeys: readonly string[];
  surfaces: readonly string[];
};

const COMMON_METADATA_KEYS = ["viewportBucket"] as const;

const PAGE_METADATA_KEYS = ["availableCouponCount"] as const;
const MATCH_METADATA_KEYS = [
  "matchId",
  "matchVisibility",
  "introduced",
  "hasMeetupSession",
] as const;
const COUPON_METADATA_KEYS = [
  "couponStatus",
  "availableCouponCount",
  "merchantId",
  "couponTemplateId",
] as const;
const MEETUP_METADATA_KEYS = [
  "sessionId",
  "matchId",
  "proposalId",
  "optionKind",
  "hasTimeOption",
  "hasLocationOption",
  "timeOptionCount",
  "locationOptionCount",
  "proposalScope",
] as const;

export const PRODUCT_EVENT_DEFINITIONS = {
  dashboard_page_viewed: {
    kind: "footprint",
    browserWritable: true,
    entityTypes: [],
    metadataKeys: [...PAGE_METADATA_KEYS],
    surfaces: ["dashboard_home"],
  },
  match_page_viewed: {
    kind: "footprint",
    browserWritable: true,
    entityTypes: ["match"],
    metadataKeys: [...MATCH_METADATA_KEYS],
    surfaces: ["match_page"],
  },
  match_contact_request_clicked: {
    kind: "intent",
    browserWritable: true,
    entityTypes: ["match"],
    metadataKeys: ["matchId"],
    surfaces: ["match_contact_button", "match_direct_invite_button"],
  },
  match_contact_requested: {
    kind: "outcome",
    browserWritable: false,
    entityTypes: ["match"],
    metadataKeys: ["matchId"],
    surfaces: [],
  },
  coupon_page_viewed: {
    kind: "footprint",
    browserWritable: true,
    entityTypes: [],
    metadataKeys: [...COUPON_METADATA_KEYS],
    surfaces: ["coupon_page"],
  },
  coupon_redeem_code_open_clicked: {
    kind: "intent",
    browserWritable: true,
    entityTypes: ["coupon"],
    metadataKeys: [...COUPON_METADATA_KEYS],
    surfaces: ["coupon_card"],
  },
  coupon_redeem_code_displayed: {
    kind: "footprint",
    browserWritable: true,
    entityTypes: ["coupon"],
    metadataKeys: [...COUPON_METADATA_KEYS],
    surfaces: ["coupon_redeem_code_dialog"],
  },
  coupon_redeemed: {
    kind: "outcome",
    browserWritable: false,
    entityTypes: ["coupon"],
    metadataKeys: ["merchantId", "couponTemplateId"],
    surfaces: [],
  },
  meetup_entry_clicked: {
    kind: "intent",
    browserWritable: true,
    entityTypes: ["match"],
    metadataKeys: [...MEETUP_METADATA_KEYS],
    surfaces: ["meetup_entry"],
  },
  meetup_flow_viewed: {
    kind: "footprint",
    browserWritable: true,
    entityTypes: ["match", "meetup_session"],
    metadataKeys: [...MEETUP_METADATA_KEYS],
    surfaces: ["meetup_start", "meetup_session"],
  },
  meetup_session_created: {
    kind: "outcome",
    browserWritable: false,
    entityTypes: ["meetup_session"],
    metadataKeys: ["sessionId", "matchId", "proposalId"],
    surfaces: [],
  },
  meetup_proposal_submit_clicked: {
    kind: "intent",
    browserWritable: true,
    entityTypes: ["match", "meetup_session"],
    metadataKeys: [...MEETUP_METADATA_KEYS],
    surfaces: [
      "meetup_start_proposal_form",
      "meetup_proposal_form",
      "meetup_revision_form",
    ],
  },
  meetup_proposal_created: {
    kind: "outcome",
    browserWritable: false,
    entityTypes: ["meetup_proposal"],
    metadataKeys: [
      "sessionId",
      "matchId",
      "proposalId",
      "hasTimeOption",
      "hasLocationOption",
      "timeOptionCount",
      "locationOptionCount",
      "proposalScope",
    ],
    surfaces: [],
  },
  meetup_option_accept_clicked: {
    kind: "intent",
    browserWritable: true,
    entityTypes: ["meetup_session"],
    metadataKeys: [...MEETUP_METADATA_KEYS],
    surfaces: ["meetup_accept_options"],
  },
  meetup_option_accepted: {
    kind: "outcome",
    browserWritable: false,
    entityTypes: ["meetup_session"],
    metadataKeys: [
      "sessionId",
      "proposalId",
      "optionKind",
      "hasTimeOption",
      "hasLocationOption",
    ],
    surfaces: [],
  },
  meetup_final_confirm_clicked: {
    kind: "intent",
    browserWritable: true,
    entityTypes: ["meetup_session"],
    metadataKeys: [...MEETUP_METADATA_KEYS],
    surfaces: ["meetup_final_confirm"],
  },
  meetup_final_confirmed: {
    kind: "outcome",
    browserWritable: false,
    entityTypes: ["meetup_session"],
    metadataKeys: ["sessionId"],
    surfaces: [],
  },
} satisfies Record<ProductEventName, ProductEventDefinition>;

export type ProductEventSurface =
  (typeof PRODUCT_EVENT_DEFINITIONS)[ProductEventName]["surfaces"][number];

const PRODUCT_EVENT_NAME_SET = new Set<string>(PRODUCT_EVENT_NAMES);
const PRODUCT_EVENT_KIND_SET = new Set<string>(PRODUCT_EVENT_KINDS);
const BROWSER_PRODUCT_EVENT_KIND_SET = new Set<string>(
  BROWSER_PRODUCT_EVENT_KINDS,
);

const COUPON_STATUS_SET = new Set(["ISSUED", "REDEEMED", "EXPIRED", "VOID"]);
const VIEWPORT_BUCKET_SET = new Set(["mobile", "tablet", "desktop", "unknown"]);
const MATCH_VISIBILITY_SET = new Set(["VISIBLE", "LIMITED", "NONE"]);
const OPTION_KIND_SET = new Set(["TIME", "LOCATION", "BOTH"]);
const PROPOSAL_SCOPE_SET = new Set(["BOTH", "TIME_ONLY", "LOCATION_ONLY"]);
const PRODUCT_EVENT_ENTITY_TYPE_SET = new Set<string>(
  PRODUCT_EVENT_ENTITY_TYPES,
);

const INTERNAL_ID_PATTERN = /^c[a-z0-9]{8,32}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_FALLBACK_ID_PATTERN = /^[a-z0-9]{6,16}-[a-z0-9]{6,32}$/;
const DETERMINISTIC_EVENT_ID_PATTERN = /^([a-z_]+):(c[a-z0-9]{8,32})$/;

const ALLOWED_ROUTE_PATTERNS = [
  /^\/dashboard$/,
  /^\/dashboard\/match$/,
  /^\/dashboard\/coupons$/,
  /^\/dashboard\/meetup\/start$/,
  /^\/dashboard\/meetup\/c[a-z0-9]{8,32}$/,
] as const;

const DENIED_METADATA_KEY_PATTERNS = [
  /code/i,
  /token/i,
  /secret/i,
  /totp/i,
  /qr/i,
  /payload/i,
  /note/i,
  /text/i,
  /message/i,
  /profile/i,
  /display.*name/i,
  /full.*name/i,
  /email/i,
  /phone/i,
  /wechat/i,
  /qq/i,
  /contact/i,
  /latitude/i,
  /longitude/i,
  /^lat$/i,
  /^lng$/i,
  /place.*name/i,
  /custom.*place/i,
  /header/i,
  /cookie/i,
  /body/i,
  /inner.*text/i,
  /input/i,
  /textarea/i,
] as const;

const SENSITIVE_VALUE_PATTERNS = [
  /@/,
  /\b(?:code|token|secret|totp|payload|cookie|header)\b/i,
  /\b(?:email|phone|wechat|qq|contact|profile|note|message)\b/i,
  /\b(?:latitude|longitude|lat|lng)\b/i,
  /\+?\d[\d ()-]{7,}\d/,
] as const;

export type ProductEventMetadata = Record<string, string | number | boolean>;

export function isProductEventName(value: string): value is ProductEventName {
  return PRODUCT_EVENT_NAME_SET.has(value);
}

export function isProductEventKind(value: string): value is ProductEventKind {
  return PRODUCT_EVENT_KIND_SET.has(value);
}

export function isBrowserProductEventKind(
  value: string,
): value is BrowserProductEventKind {
  return BROWSER_PRODUCT_EVENT_KIND_SET.has(value);
}

export function getProductEventDefinition(
  name: string,
): ProductEventDefinition | null {
  if (!isProductEventName(name)) return null;
  return PRODUCT_EVENT_DEFINITIONS[name];
}

export function sanitizeProductEventMetadata(
  name: ProductEventName,
  metadata: unknown,
): ProductEventMetadata | null {
  if (!isPlainRecord(metadata)) {
    return null;
  }

  const definition = PRODUCT_EVENT_DEFINITIONS[name];
  const allowedKeys = new Set<string>([
    ...COMMON_METADATA_KEYS,
    ...definition.metadataKeys,
  ]);
  const sanitized: ProductEventMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedKeys.has(key) || isDeniedMetadataKey(key)) {
      continue;
    }

    const sanitizedValue = sanitizeMetadataValue(key, value);
    if (sanitizedValue === undefined) {
      continue;
    }
    sanitized[key] = sanitizedValue;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export function sanitizeProductEventId(value: unknown): string | null {
  return sanitizeBrowserProductEventId(value);
}

export function sanitizeBrowserProductEventId(value: unknown): string | null {
  const trimmed = cleanString(value);
  if (!trimmed) return null;
  if (UUID_PATTERN.test(trimmed) || CLIENT_FALLBACK_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function sanitizeProductOutcomeEventId(
  value: unknown,
  name: ProductEventName,
): string | null {
  const trimmed = cleanString(value);
  if (!trimmed) return null;
  const match = DETERMINISTIC_EVENT_ID_PATTERN.exec(trimmed);
  if (!match || match[1] !== name) return null;
  return trimmed;
}

export function sanitizeProductEventSessionId(value: unknown): string | null {
  const trimmed = cleanString(value);
  if (!trimmed) return null;
  if (UUID_PATTERN.test(trimmed) || CLIENT_FALLBACK_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function sanitizeProductEventCorrelationId(
  value: unknown,
): string | null {
  return sanitizeProductEventSessionId(value);
}

export function sanitizeProductEventRoute(value: unknown): string | null {
  const trimmed = cleanString(value);
  if (!trimmed) return null;

  let pathname = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      pathname = new URL(trimmed).pathname;
    }
  } catch {
    return null;
  }
  pathname = pathname.split(/[?#]/, 1)[0] ?? "";

  return ALLOWED_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
    ? pathname
    : null;
}

export function sanitizeProductEventSurface(
  name: ProductEventName,
  value: unknown,
): ProductEventSurface | null {
  const trimmed = cleanString(value);
  if (!trimmed || hasSensitiveValue(trimmed)) return null;
  const allowedSurfaces = PRODUCT_EVENT_DEFINITIONS[name]
    .surfaces as readonly string[];
  return allowedSurfaces.includes(trimmed)
    ? (trimmed as ProductEventSurface)
    : null;
}

export function sanitizeProductEventEntityType(
  name: ProductEventName,
  value: unknown,
): ProductEventEntityType | null {
  const trimmed = cleanString(value);
  if (!trimmed) return null;
  if (!PRODUCT_EVENT_ENTITY_TYPE_SET.has(trimmed)) return null;
  const allowedTypes = PRODUCT_EVENT_DEFINITIONS[name]
    .entityTypes as readonly string[];
  return allowedTypes.includes(trimmed)
    ? (trimmed as ProductEventEntityType)
    : null;
}

export function sanitizeProductEventEntityId(value: unknown): string | null {
  return sanitizeInternalId(value);
}

function isDeniedMetadataKey(key: string) {
  return DENIED_METADATA_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeMetadataValue(
  key: string,
  value: unknown,
): string | number | boolean | undefined {
  switch (key) {
    case "viewportBucket":
      return sanitizeEnumValue(value, VIEWPORT_BUCKET_SET);
    case "couponStatus":
      return sanitizeEnumValue(value, COUPON_STATUS_SET);
    case "matchVisibility":
      return sanitizeEnumValue(value, MATCH_VISIBILITY_SET);
    case "sessionId":
    case "matchId":
    case "proposalId":
    case "merchantId":
    case "couponTemplateId":
      return sanitizeInternalId(value) ?? undefined;
    case "optionKind":
      return sanitizeEnumValue(value, OPTION_KIND_SET);
    case "proposalScope":
      return sanitizeEnumValue(value, PROPOSAL_SCOPE_SET);
    case "introduced":
    case "hasMeetupSession":
    case "hasTimeOption":
    case "hasLocationOption":
      return typeof value === "boolean" ? value : undefined;
    case "availableCouponCount":
    case "timeOptionCount":
    case "locationOptionCount":
      return sanitizeCount(value);
    default:
      return undefined;
  }
}

function sanitizeEnumValue(value: unknown, allowed: Set<string>) {
  const trimmed = cleanString(value);
  if (!trimmed || hasSensitiveValue(trimmed)) return undefined;
  return allowed.has(trimmed) ? trimmed : undefined;
}

function sanitizeCount(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 999
      ? value
      : undefined;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 999
      ? parsed
      : undefined;
  }
  return undefined;
}

function sanitizeInternalId(value: unknown) {
  const trimmed = cleanString(value);
  if (!trimmed) return null;
  return INTERNAL_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}

function hasSensitiveValue(value: string) {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}
