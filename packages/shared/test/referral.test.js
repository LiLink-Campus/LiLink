const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REFERRAL_CHANNELS,
  REFERRAL_SOURCE_TYPES,
  REFERRAL_MEDIUMS,
  REFERRAL_SCENES,
  deriveReferralSource,
  splitReferralChannel,
  CHANNEL_META,
  MEDIUM_LABELS,
  SCENE_LABELS,
} = require("../dist");

// --- REFERRAL_SOURCE_TYPES ---

test("REFERRAL_SOURCE_TYPES contains PERSONAL, DEFAULT", () => {
  assert.ok(REFERRAL_SOURCE_TYPES.includes("PERSONAL"));
  assert.ok(REFERRAL_SOURCE_TYPES.includes("DEFAULT"));
  assert.equal(REFERRAL_SOURCE_TYPES.length, 2);
});

// --- deriveReferralSource ---

test("deriveReferralSource: referredByUserId present → PERSONAL", () => {
  assert.equal(
    deriveReferralSource({ referredByUserId: "user-456" }),
    "PERSONAL"
  );
});

test("deriveReferralSource: no referrer → DEFAULT", () => {
  assert.equal(deriveReferralSource({ referredByUserId: null }), "DEFAULT");
});

test("deriveReferralSource: undefined params → DEFAULT", () => {
  assert.equal(deriveReferralSource({}), "DEFAULT");
});

// --- REFERRAL_MEDIUMS / REFERRAL_SCENES ---

test("REFERRAL_MEDIUMS contains expected values", () => {
  assert.ok(REFERRAL_MEDIUMS.includes("WECHAT"));
  assert.ok(REFERRAL_MEDIUMS.includes("LINK"));
  assert.ok(REFERRAL_MEDIUMS.includes("QR"));
  assert.ok(REFERRAL_MEDIUMS.includes("OTHER"));
  assert.equal(REFERRAL_MEDIUMS.length, 4);
});

test("REFERRAL_SCENES contains expected values", () => {
  assert.ok(REFERRAL_SCENES.includes("MOMENTS"));
  assert.ok(REFERRAL_SCENES.includes("GROUP"));
  assert.ok(REFERRAL_SCENES.includes("PRIVATE"));
  assert.equal(REFERRAL_SCENES.length, 3);
});

// --- splitReferralChannel ---

test("splitReferralChannel: WECHAT_MOMENTS → {WECHAT, MOMENTS}", () => {
  assert.deepEqual(splitReferralChannel("WECHAT_MOMENTS"), {
    medium: "WECHAT",
    scene: "MOMENTS",
  });
});

test("splitReferralChannel: WECHAT_GROUP → {WECHAT, GROUP}", () => {
  assert.deepEqual(splitReferralChannel("WECHAT_GROUP"), {
    medium: "WECHAT",
    scene: "GROUP",
  });
});

test("splitReferralChannel: WECHAT_PRIVATE → {WECHAT, PRIVATE}", () => {
  assert.deepEqual(splitReferralChannel("WECHAT_PRIVATE"), {
    medium: "WECHAT",
    scene: "PRIVATE",
  });
});

test("splitReferralChannel: COPY_LINK → {LINK, null}", () => {
  assert.deepEqual(splitReferralChannel("COPY_LINK"), {
    medium: "LINK",
    scene: null,
  });
});

test("splitReferralChannel: QR → {QR, null}", () => {
  assert.deepEqual(splitReferralChannel("QR"), {
    medium: "QR",
    scene: null,
  });
});

test("splitReferralChannel: OTHER → {OTHER, null}", () => {
  assert.deepEqual(splitReferralChannel("OTHER"), {
    medium: "OTHER",
    scene: null,
  });
});

// --- CHANNEL_META ---

test("CHANNEL_META has an entry for every channel in REFERRAL_CHANNELS", () => {
  for (const channel of REFERRAL_CHANNELS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(CHANNEL_META, channel),
      `CHANNEL_META missing entry for channel: ${channel}`
    );
    const meta = CHANNEL_META[channel];
    assert.equal(typeof meta.label, "string", `${channel}.label should be string`);
    assert.equal(typeof meta.hint, "string", `${channel}.hint should be string`);
    assert.equal(typeof meta.guide, "string", `${channel}.guide should be string`);
  }
});

test("CHANNEL_META opensWeChat is true for all WECHAT channels", () => {
  assert.equal(CHANNEL_META["WECHAT_MOMENTS"].opensWeChat, true);
  assert.equal(CHANNEL_META["WECHAT_GROUP"].opensWeChat, true);
  assert.equal(CHANNEL_META["WECHAT_PRIVATE"].opensWeChat, true);
});

test("CHANNEL_META opensWeChat is absent or falsy for non-WECHAT channels", () => {
  assert.ok(!CHANNEL_META["COPY_LINK"].opensWeChat);
  assert.ok(!CHANNEL_META["QR"].opensWeChat);
  assert.ok(!CHANNEL_META["OTHER"].opensWeChat);
});

// --- MEDIUM_LABELS / SCENE_LABELS ---

test("MEDIUM_LABELS has Chinese label for every medium", () => {
  assert.equal(MEDIUM_LABELS["WECHAT"], "微信");
  assert.equal(MEDIUM_LABELS["LINK"], "链接");
  assert.equal(MEDIUM_LABELS["QR"], "二维码");
  assert.equal(MEDIUM_LABELS["OTHER"], "其他");
});

test("SCENE_LABELS has Chinese label for every scene", () => {
  assert.equal(SCENE_LABELS["MOMENTS"], "朋友圈");
  assert.equal(SCENE_LABELS["GROUP"], "群");
  assert.equal(SCENE_LABELS["PRIVATE"], "私聊");
});
