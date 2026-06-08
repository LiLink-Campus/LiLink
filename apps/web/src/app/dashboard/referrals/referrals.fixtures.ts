import { REFERRAL_CHANNELS } from "@lilink/shared";
import type { MyReferralOverview } from "../../../lib/api";

const SAMPLE_CODE = "3E4V87GBP2";
const STORY_ORIGIN = "http://localhost:3000";

function createLinks(code: string) {
  return REFERRAL_CHANNELS.map((channel) => ({
    channel,
    url: `${STORY_ORIGIN}/i/${code}?ch=${channel}`,
  }));
}

const emptyFunnel: MyReferralOverview["funnel"] = {
  invited: 0,
  registered: 0,
  activated: 0,
  granted: 0,
  redeemed: 0,
};

function baseReferral(
  overrides: Partial<MyReferralOverview> = {},
): MyReferralOverview {
  return {
    referralCode: SAMPLE_CODE,
    links: createLinks(SAMPLE_CODE),
    funnel: emptyFunnel,
    nonEduReferralQuota: { limit: 3, uses: 0, remaining: 3 },
    ...overrides,
  };
}

/** Fixture map for Storybook / visual regression. */
export const referralFixtures = {
  /** 普通邮箱用户：limit 为 0，只能分享链接邀请学校邮箱同学。 */
  nonEduUser: baseReferral({
    nonEduReferralQuota: { limit: 0, uses: 0, remaining: 0 },
  }),
  /** 学校邮箱用户：名额充足。 */
  eduWithFullQuota: baseReferral({
    nonEduReferralQuota: { limit: 3, uses: 0, remaining: 3 },
  }),
  /** 学校邮箱用户：已用部分名额。 */
  eduPartialQuota: baseReferral({
    nonEduReferralQuota: { limit: 3, uses: 1, remaining: 2 },
  }),
  /** 学校邮箱用户：普通邮箱名额已用完。 */
  eduQuotaExhausted: baseReferral({
    nonEduReferralQuota: { limit: 3, uses: 3, remaining: 0 },
  }),
  /** 已有邀请记录。 */
  withInvitedFriends: baseReferral({
    funnel: {
      invited: 2,
      registered: 2,
      activated: 1,
      granted: 0,
      redeemed: 0,
    },
  }),
  /** 邀请码尚未生成。 */
  noReferralCode: baseReferral({
    referralCode: null,
    links: [],
  }),
} satisfies Record<string, MyReferralOverview>;

export type ReferralFixtureName = keyof typeof referralFixtures;
