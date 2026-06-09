const test = require("node:test");
const assert = require("node:assert/strict");

const {
  profileAttentionElementId,
  profileAttentionHashForKey,
  profileAttentionKeyFromHash,
} = require("../dist");

test("profileAttentionHashForKey round-trips through profileAttentionKeyFromHash", () => {
  for (const key of ["hard_partner_age_min", "scale_q"]) {
    assert.equal(
      profileAttentionKeyFromHash(profileAttentionHashForKey(key)),
      key,
    );
  }
});

test("profileAttentionKeyFromHash ignores retired questionnaire hashes", () => {
  assert.equal(
    profileAttentionKeyFromHash("#questionnaire-question-custom_key"),
    null,
  );
});

test("profileAttentionKeyFromHash returns null for unrelated hashes", () => {
  assert.equal(profileAttentionKeyFromHash("#other-anchor"), null);
  assert.equal(profileAttentionKeyFromHash(""), null);
});

test("profileAttentionKeyFromHash returns null when the segment is not valid URI encoding", () => {
  assert.equal(
    profileAttentionKeyFromHash("#profile-attention-bad%"),
    null,
  );
});

test("profileAttentionElementId matches DOM id used for scrolling", () => {
  assert.equal(
    profileAttentionElementId("hard_gender"),
    "profile-attention-hard_gender",
  );
});
