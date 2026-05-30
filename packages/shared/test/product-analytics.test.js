const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PRODUCT_EVENT_DEFINITIONS,
  PRODUCT_EVENT_NAMES,
  sanitizeBrowserProductEventId,
  sanitizeProductEventRoute,
  sanitizeProductEventEntityId,
  sanitizeProductEventEntityType,
  sanitizeProductEventMetadata,
  sanitizeProductOutcomeEventId,
  sanitizeProductEventSurface,
} = require("../dist");

const SESSION_ID = "cm00000000000000000000001";
const MATCH_ID = "cm00000000000000000000002";

test("product analytics definitions cover every event name", () => {
  for (const name of PRODUCT_EVENT_NAMES) {
    assert.ok(PRODUCT_EVENT_DEFINITIONS[name], `${name} is missing`);
  }
});

test("product analytics metadata keeps allowlisted fields", () => {
  assert.deepEqual(
    sanitizeProductEventMetadata("meetup_proposal_submit_clicked", {
      sessionId: SESSION_ID,
      matchId: MATCH_ID,
      hasTimeOption: true,
      locationOptionCount: 2,
      proposalScope: "BOTH",
    }),
    {
      sessionId: SESSION_ID,
      matchId: MATCH_ID,
      hasTimeOption: true,
      locationOptionCount: 2,
      proposalScope: "BOTH",
    },
  );
});

test("product analytics metadata keeps campus match funnel dimensions", () => {
  assert.deepEqual(
    sanitizeProductEventMetadata("match_page_viewed", {
      matchId: MATCH_ID,
      matchVisibility: "VISIBLE",
      introduced: false,
      hasMeetupSession: true,
      availableCouponCount: 3,
    }),
    {
      matchId: MATCH_ID,
      matchVisibility: "VISIBLE",
      introduced: false,
      hasMeetupSession: true,
    },
  );
});

test("product analytics metadata drops sensitive and unknown fields", () => {
  assert.deepEqual(
    sanitizeProductEventMetadata("coupon_redeem_code_displayed", {
      couponStatus: "ISSUED",
      code: "ABC-123",
      totpSecret: "secret",
      qrPayload: "payload",
      email: "person@example.com",
      unknown: "value",
    }),
    { couponStatus: "ISSUED" },
  );
});

test("product analytics metadata drops UTM query values", () => {
  assert.deepEqual(
    sanitizeProductEventMetadata("dashboard_page_viewed", {
      viewportBucket: "desktop",
      utm_source: "newsletter",
      utm_campaign: "SPRING25",
      utm_content: "Library 2F",
      utm_term: "JBSWY3DPEHPK3PXP",
    }),
    { viewportBucket: "desktop" },
  );
});

test("product analytics metadata never keeps meetup text or exact location", () => {
  assert.deepEqual(
    sanitizeProductEventMetadata("meetup_proposal_submit_clicked", {
      noteText: "see you there",
      placeName: "Library 2F",
      latitude: 31.2,
      longitude: 121.4,
      hasLocationOption: true,
    }),
    { hasLocationOption: true },
  );
});

test("product analytics metadata validates allowlisted value semantics", () => {
  assert.deepEqual(
    sanitizeProductEventMetadata("coupon_redeem_code_displayed", {
      couponStatus: "123456",
      availableCouponCount: "2",
      merchantId: "merchant email person@example.com",
      couponTemplateId: "ABC123",
    }),
    { availableCouponCount: 2 },
  );
});

test("product analytics route sanitizer strips query strings and blocks unsafe paths", () => {
  assert.equal(
    sanitizeProductEventRoute("/dashboard/coupons?code=ABC123&totp=123456"),
    "/dashboard/coupons",
  );
  assert.equal(
    sanitizeProductEventRoute(
      `/dashboard/meetup/${SESSION_ID}?phone=12345678901#contact`,
    ),
    `/dashboard/meetup/${SESSION_ID}`,
  );
  assert.equal(sanitizeProductEventRoute("/dashboard/profile"), null);
  assert.equal(
    sanitizeProductEventRoute(`/dashboard/meetup/${SESSION_ID}/profile`),
    null,
  );
});

test("product analytics surfaces are allowlisted per event", () => {
  assert.equal(
    sanitizeProductEventSurface(
      "coupon_redeem_code_displayed",
      "coupon_redeem_code_dialog",
    ),
    "coupon_redeem_code_dialog",
  );
  assert.equal(
    sanitizeProductEventSurface("meetup_flow_viewed", "meetup_session"),
    "meetup_session",
  );
  assert.equal(
    sanitizeProductEventSurface("match_page_viewed", "match_page"),
    "match_page",
  );
  assert.equal(
    sanitizeProductEventSurface(
      "match_contact_request_clicked",
      "match_contact_button",
    ),
    "match_contact_button",
  );
  assert.equal(
    sanitizeProductEventSurface("coupon_redeem_code_displayed", "coupon_card"),
    null,
  );
  assert.equal(
    sanitizeProductEventSurface("coupon_page_viewed", "library-2f"),
    null,
  );
  assert.equal(
    sanitizeProductEventSurface("coupon_redeemed", "coupon_card"),
    null,
  );
});

test("product analytics entity ids require internal ids", () => {
  assert.equal(sanitizeProductEventEntityId(SESSION_ID), SESSION_ID);
  assert.equal(sanitizeProductEventEntityId("coupon-code-ABC123"), null);
  assert.equal(sanitizeProductEventEntityId("note text from user"), null);
});

test("product analytics entity types are allowlisted per event", () => {
  assert.equal(
    sanitizeProductEventEntityType("coupon_redeem_code_displayed", "coupon"),
    "coupon",
  );
  assert.equal(
    sanitizeProductEventEntityType("dashboard_page_viewed", "coupon"),
    null,
  );
  assert.equal(
    sanitizeProductEventEntityType("match_page_viewed", "match"),
    "match",
  );
  assert.equal(
    sanitizeProductEventEntityType("match_page_viewed", "coupon"),
    null,
  );
  assert.equal(
    sanitizeProductEventEntityType("meetup_flow_viewed", "meetup_session"),
    "meetup_session",
  );
  assert.equal(
    sanitizeProductEventEntityType("meetup_final_confirmed", "coupon"),
    null,
  );
});

test("product analytics separates browser and outcome event ids", () => {
  assert.equal(
    sanitizeBrowserProductEventId("123e4567-e89b-12d3-a456-426614174000"),
    "123e4567-e89b-12d3-a456-426614174000",
  );
  assert.equal(
    sanitizeBrowserProductEventId(`coupon_redeemed:${SESSION_ID}`),
    null,
  );
  assert.equal(
    sanitizeProductOutcomeEventId(
      `coupon_redeemed:${SESSION_ID}`,
      "coupon_redeemed",
    ),
    `coupon_redeemed:${SESSION_ID}`,
  );
  assert.equal(
    sanitizeProductOutcomeEventId(
      `meetup_final_confirmed:${SESSION_ID}`,
      "coupon_redeemed",
    ),
    null,
  );
});
