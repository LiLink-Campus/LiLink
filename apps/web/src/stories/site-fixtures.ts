import type { LandingPayload } from "@/lib/landing-payload";
import type { DevlogFeed } from "@/lib/devlog-feed-utils";
import type { EligibleSchoolsPayload } from "@/lib/eligible-schools";
import type { ContactPreferencesPayload, Question } from "@/app/dashboard/_lib/types";
import type { MyCoupon, PrepareRedeemOk, MerchantSessionUser } from "@/lib/api";
import { matchStoryUser } from "@/app/dashboard/match/match.fixtures";

export const now = "2030-04-08T08:00:00.000Z";
export const landing: LandingPayload = {
  brand: "LiLink",
  tagline: "校园里的，认真相遇。",
  stats: { registeredUsers: 520, completedQuestionnaires: 480, matchesDelivered: 120 },
  currentCycle: {
    codename: "春日相遇",
    participationDeadline: "2030-04-10T12:00:00Z",
    revealAt: "2030-04-12T12:00:00Z",
  },
};
export const schools: EligibleSchoolsPayload = {
  schools: [
    {
      id: "school-story-1",
      name: "青禾大学",
      description: "合成学校，用于界面验证",
      domains: ["qinghe.example.edu"],
    },
    {
      id: "school-story-2",
      name: "远山理工大学国际交流学院",
      description: null,
      domains: ["yuanshan.example.edu", "student.yuanshan.example.edu"],
    },
  ],
  totalSchoolCount: 2,
  totalDomainCount: 3,
  generatedAt: now,
};
export const feed: DevlogFeed = {
  generatedAt: now,
  latestPublishedAt: "2030-04-08",
  totalPublished: 18,
  items: Array.from({ length: 12 }, (_, i) => ({
    title: ["让相遇，更进一步", "每一轮，都由你决定", "资料保存体验更新"][i % 3] + ` · ${12 - i}`,
    summary: "匹配结果与联系方式集中呈现，完善移动端阅读和操作体验。",
    publishedAt: `2030-04-${String(8 - (i % 8)).padStart(2, "0")}`,
    url: `https://updates.example.test/posts/${i}`,
    tags: ["体验优化", "产品更新"],
  })),
};
export const contacts: ContactPreferencesPayload = {
  revision: 0,
  email: matchStoryUser.email,
  preferredContactChannel: "EMAIL",
  methods: [],
};
export const questions: Question[] = [
  {
    id: "question-story-1",
    key: "weekend",
    prompt: "周末你更喜欢怎样度过？",
    type: "SINGLE_SELECT",
    options: [
      { value: "outside", label: "出门走走" },
      { value: "home", label: "在家休息" },
    ],
  },
  {
    id: "question-story-2",
    key: "interests",
    prompt: "你想一起尝试哪些活动？",
    type: "MULTI_SELECT",
    selectionLimit: 2,
    options: [
      { value: "reading", label: "阅读" },
      { value: "hiking", label: "徒步" },
      { value: "coffee", label: "喝咖啡" },
    ],
  },
  {
    id: "question-story-3",
    key: "social",
    prompt: "你有多喜欢认识新朋友？",
    type: "SCALE",
    options: ["很少", "偶尔", "一般", "比较喜欢", "非常喜欢"].map((label, index) => ({
      value: String(index + 1),
      label,
    })),
  },
];
export const coupon: MyCoupon = {
  id: "coupon-story-1",
  status: "ISSUED",
  code: "AB23CD",
  merchantName: "青禾咖啡（合成商家）",
  title: "春日双人咖啡券",
  benefitType: "DISCOUNT",
  benefitText: "满 50 元减 10 元",
  faceValue: 1000,
  issuedAt: "2030-04-01T08:00:00Z",
  expiresAt: "2030-05-01T08:00:00Z",
  redeemedAt: null,
};
export const merchant: MerchantSessionUser = {
  id: "merchant-user-story",
  email: "clerk@example.test",
  displayName: "店员小禾",
  role: "STAFF",
  merchantId: "merchant-story-1",
  merchantName: coupon.merchantName,
};
export const prepare: PrepareRedeemOk = {
  result: "OK",
  coupon: {
    title: coupon.title,
    benefitText: coupon.benefitText,
    faceValue: 1000,
    userDisplayName: "林和",
  },
  needAmount: true,
  redeemTicket: "storybook-ticket-only",
};
export const savedProfile = {
  versionId: "questionnaire-story-v1",
  currentVersionId: "questionnaire-story-v1",
  submittedAt: now,
  draft: null,
  attention: null,
  answers: {
    hard_birth_date: "2005-02-18",
    hard_partner_age_min: 20,
    hard_partner_age_max: 30,
    hard_gender: "女",
    hard_partner_genders: ["男"],
    hard_nationality: "中国",
    hard_partner_nationalities: [],
    hard_languages: ["中文"],
    hard_partner_languages: [],
    hard_looks: "普通人",
    hard_partner_looks: [],
    hard_height_cm: 168,
    hard_partner_height_min: 160,
    hard_partner_height_max: 200,
    hard_weight_kg: 65,
    hard_partner_weight_min: null,
    hard_partner_weight_max: null,
    hard_one_liner_intro: "周末喜欢散步、逛书店和喝咖啡，期待认识聊得来的朋友。",
    hard_excluded_partner_schools: [],
    hard_excluded_partner_school_genders: [],
    weekend: "outside",
    interests: ["reading", "coffee"],
    social: "4",
  },
};
