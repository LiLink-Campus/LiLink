import { config as loadEnv } from 'dotenv';
import path from 'path';
import * as argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { PrismaClient, QuestionType, UserStatus } from '@prisma/client';
import {
  HARD_MATCH_GENDERS,
  HARD_MATCH_HEIGHT_MAX_CM,
  HARD_MATCH_HEIGHT_MIN_CM,
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
} from '../src/modules/questionnaire/hard-match.constants';

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');
loadEnv({ path: path.join(repoRoot, '.env') });
loadEnv({ path: path.join(apiRoot, '.env'), override: true });

const prisma = new PrismaClient();

function createOptions(labels: readonly string[]) {
  return labels.map((label) => ({
    value: label,
    label,
  }));
}

function exactMatchRule(template: string, priority: number) {
  return [
    {
      type: 'EXACT_MATCH',
      template,
      priority,
    },
  ];
}

function multiOverlapRule(
  template: string,
  priority: number,
  maxLabels = 2,
  minOverlap = 1,
) {
  return [
    {
      type: 'MULTI_OVERLAP',
      template,
      priority,
      maxLabels,
      minOverlap,
    },
  ];
}

const OUTING_SPEND_OPTIONS = [
  '无所谓，看当时和心情',
  '更希望 AA',
  '更能接受对方多出或主动请客',
  '更愿意自己多出或主动请客',
  '不太希望总是只有我出钱（不强求对方全包）',
] as const;
const SCALE_OPTIONS = [
  '非常不像我',
  '比较不像我',
  '看情况',
  '比较像我',
  '非常像我',
] as const;

const RELATIONSHIP_INTENT_OPTIONS = [
  '认真稳定的关系',
  '先认真了解再决定',
  '轻松认识，顺其自然',
] as const;

const PACE_OPTIONS = ['慢热', '平衡', '主动推进'] as const;

const DEFINE_RELATIONSHIP_TIMING_OPTIONS = [
  '熟悉后尽快明确',
  '相处一段时间再确认',
  '不急着定义关系',
] as const;

const CONTACT_FREQUENCY_OPTIONS = ['高互动', '适中', '保持留白'] as const;
const WEEKEND_OPTIONS = ['出门探索', '轻社交', '安静恢复'] as const;

const COMMUNICATION_OPTIONS = [
  '当场说清楚',
  '先冷静再沟通',
  '给彼此缓冲时间',
] as const;

const REPAIR_STYLE_OPTIONS = [
  '先讲清楚逻辑',
  '先安抚情绪',
  '先给空间再回来聊',
] as const;

const APOLOGY_EXPECTATION_OPTIONS = [
  '及时道歉',
  '解释清楚',
  '后续行动',
] as const;

const CAREER_RELATIONSHIP_BALANCE_OPTIONS = [
  '感情优先',
  '尽量平衡',
  '更看重学业或事业',
] as const;

const VALUE_POOL = [
  '真诚',
  '稳定',
  '责任感',
  '尊重边界',
  '好奇心',
  '上进',
  '温柔',
  '幽默感',
] as const;

const GREEN_FLAG_OPTIONS = [
  '说到做到',
  '情绪稳定',
  '边界清楚',
  '愿意表达',
  '有上进心',
  '会照顾人',
  '松弛幽默',
] as const;

const RED_FLAG_OPTIONS = [
  '冷处理',
  '阴阳怪气',
  '控制欲',
  '失联',
  '迟到失约',
  '情绪爆炸',
  '不尊重边界',
] as const;

const SUPPORT_NEED_OPTIONS = [
  '陪我聊天',
  '给出建议',
  '直接帮我做事',
  '带我放松',
  '给我空间',
  '明确表达在乎',
] as const;

const FEELING_CARED_FOR_OPTIONS = [
  '及时回复',
  '主动约我',
  '记住细节',
  '明确表达喜欢',
  '实际照顾',
  '稳定陪伴',
  '尊重我的节奏',
] as const;

const IDEAL_DATE_STYLE_OPTIONS = [
  '散步聊天',
  '探店吃饭',
  '运动户外',
  '看展看电影',
  '宅家陪伴',
  '短途出行',
  '一起做正事',
] as const;

const SHARED_GROWTH_TOPIC_OPTIONS = [
  '学业事业',
  '健身作息',
  '情绪成熟',
  '旅行体验',
  '审美兴趣',
  '社交拓展',
  '财务规划',
] as const;

const FUTURE_PICTURE_OPTIONS = [
  '稳定陪伴',
  '个人成长',
  '经济安全',
  '自由感',
  '家庭连接',
  '新鲜体验',
  '共同目标',
] as const;

const ADMIRED_PARTNER_TRAIT_OPTIONS = [
  '温柔耐心',
  '有主见',
  '自律可靠',
  '直接坦诚',
  '有趣松弛',
  '有边界感',
  '有行动力',
] as const;

const SMALL_HAPPINESS_OPTIONS = [
  '一起吃饭',
  '深夜长聊',
  '散步吹风',
  '一起学习',
  '肢体靠近',
  '分享日常',
  '临时起意的小冒险',
] as const;

type QuestionnaireSeedQuestion = {
  key: string;
  prompt: string;
  type: QuestionType;
  order: number;
  weight: number;
  options: readonly string[];
  selectionLimit?: number;
  reasonRules: Prisma.InputJsonValue;
};

const QUESTIONNAIRE_DEFINITIONS: readonly QuestionnaireSeedQuestion[] = [
  {
    key: 'relationship_intent',
    prompt: '你更想进入一段怎样的关系？',
    type: QuestionType.SINGLE_SELECT,
    order: 1,
    weight: 4,
    options: RELATIONSHIP_INTENT_OPTIONS,
    reasonRules: exactMatchRule(
      '你们对进入关系的预期都偏向 {{answer_label}}。',
      4,
    ),
  },
  {
    key: 'pace',
    prompt: '你更舒服的关系推进节奏是？',
    type: QuestionType.SINGLE_SELECT,
    order: 2,
    weight: 3,
    options: PACE_OPTIONS,
    reasonRules: exactMatchRule(
      '你们都更接受 {{answer_label}} 的推进节奏。',
      3,
    ),
  },
  {
    key: 'define_relationship_timing',
    prompt: '你更接受什么时候明确关系？',
    type: QuestionType.SINGLE_SELECT,
    order: 3,
    weight: 3,
    options: DEFINE_RELATIONSHIP_TIMING_OPTIONS,
    reasonRules: exactMatchRule(
      '你们对“什么时候确认关系”的想法比较接近。',
      3,
    ),
  },
  {
    key: 'contact_frequency',
    prompt: '你理想中的联系频率更接近哪一种？',
    type: QuestionType.SINGLE_SELECT,
    order: 4,
    weight: 3,
    options: CONTACT_FREQUENCY_OPTIONS,
    reasonRules: exactMatchRule(
      '你们都舒服于 {{answer_label}} 的联系频率。',
      3,
    ),
  },
  {
    key: 'weekend',
    prompt: '理想周末更接近哪一种？',
    type: QuestionType.SINGLE_SELECT,
    order: 5,
    weight: 2,
    options: WEEKEND_OPTIONS,
    reasonRules: exactMatchRule(
      '你们都更喜欢 {{answer_label}} 的周末状态。',
      2,
    ),
  },
  {
    key: 'communication',
    prompt: '发生分歧时，你更希望对方怎么做？',
    type: QuestionType.SINGLE_SELECT,
    order: 6,
    weight: 4,
    options: COMMUNICATION_OPTIONS,
    reasonRules: exactMatchRule(
      '你们处理分歧时，都更接受 {{answer_label}}。',
      4,
    ),
  },
  {
    key: 'repair_style',
    prompt: '关系里闹别扭后，你更吃哪种修复方式？',
    type: QuestionType.SINGLE_SELECT,
    order: 7,
    weight: 4,
    options: REPAIR_STYLE_OPTIONS,
    reasonRules: exactMatchRule(
      '你们对冲突后的修复方式比较一致。',
      4,
    ),
  },
  {
    key: 'apology_expectation',
    prompt: '如果对方做错了事，你更看重哪一点？',
    type: QuestionType.SINGLE_SELECT,
    order: 8,
    weight: 3,
    options: APOLOGY_EXPECTATION_OPTIONS,
    reasonRules: exactMatchRule('你们都更在意 {{answer_label}}。', 3),
  },
  {
    key: 'outing_spend_style',
    prompt: '一起出去玩时，花钱方式你更倾向哪一种？',
    type: QuestionType.SINGLE_SELECT,
    order: 9,
    weight: 2,
    options: OUTING_SPEND_OPTIONS,
    reasonRules: exactMatchRule(
      '你们对出去玩时谁来买单或 AA 的期待比较一致，相处时更省心。',
      2,
    ),
  },
  {
    key: 'career_relationship_balance',
    prompt: '现阶段你更希望感情和个人发展怎么平衡？',
    type: QuestionType.SINGLE_SELECT,
    order: 10,
    weight: 2,
    options: CAREER_RELATIONSHIP_BALANCE_OPTIONS,
    reasonRules: exactMatchRule(
      '你们对当前阶段重心的判断接近。',
      2,
    ),
  },
  {
    key: 'social_energy',
    prompt: '熟起来以后，我通常会主动推进联系和见面。',
    type: QuestionType.SCALE,
    order: 11,
    weight: 2,
    options: SCALE_OPTIONS,
    reasonRules: exactMatchRule(
      '你们在主动推进关系这件事上的倾向比较接近。',
      2,
    ),
  },
  {
    key: 'emotional_openness',
    prompt: '在关系里，我愿意把自己的真实情绪直接说出来。',
    type: QuestionType.SCALE,
    order: 12,
    weight: 2,
    options: SCALE_OPTIONS,
    reasonRules: exactMatchRule(
      '你们在表达真实情绪这件事上的习惯比较接近。',
      2,
    ),
  },
  {
    key: 'space_need',
    prompt: '即使关系亲密，我也需要稳定的独处空间。',
    type: QuestionType.SCALE,
    order: 13,
    weight: 2,
    options: SCALE_OPTIONS,
    reasonRules: exactMatchRule(
      '你们对亲密和个人空间的边界感比较接近。',
      2,
    ),
  },
  {
    key: 'novelty_need',
    prompt: '我希望关系里持续有新鲜感和变化。',
    type: QuestionType.SCALE,
    order: 14,
    weight: 2,
    options: SCALE_OPTIONS,
    reasonRules: exactMatchRule(
      '你们对关系中新鲜感的偏好比较接近。',
      2,
    ),
  },
  {
    key: 'values',
    prompt: '请选择你最看重的 4 项价值。',
    type: QuestionType.MULTI_SELECT,
    order: 15,
    weight: 4,
    options: VALUE_POOL,
    selectionLimit: 4,
    reasonRules: multiOverlapRule(
      '你们都把 {{labels_2}} 放在重要位置。',
      4,
    ),
  },
  {
    key: 'green_flags',
    prompt: '请选择最能打动你的 3 个“加分项”。',
    type: QuestionType.MULTI_SELECT,
    order: 16,
    weight: 3,
    options: GREEN_FLAG_OPTIONS,
    selectionLimit: 3,
    reasonRules: multiOverlapRule(
      '你们都会被 {{labels_2}} 这类特质打动。',
      3,
    ),
  },
  {
    key: 'red_flag_sensitivity',
    prompt: '请选择你最在意的 3 个“雷点”。',
    type: QuestionType.MULTI_SELECT,
    order: 17,
    weight: 3,
    options: RED_FLAG_OPTIONS,
    selectionLimit: 3,
    reasonRules: multiOverlapRule(
      '你们都对 {{labels_2}} 这类相处问题比较敏感。',
      3,
    ),
  },
  {
    key: 'support_need',
    prompt: '当你状态不好时，你最需要哪 3 种支持？',
    type: QuestionType.MULTI_SELECT,
    order: 18,
    weight: 3,
    options: SUPPORT_NEED_OPTIONS,
    selectionLimit: 3,
    reasonRules: multiOverlapRule(
      '你们需要的支持方式里，都包含 {{labels_2}}。',
      3,
    ),
  },
  {
    key: 'feeling_cared_for',
    prompt: '你最容易从哪 3 种行为里感到被在乎？',
    type: QuestionType.MULTI_SELECT,
    order: 19,
    weight: 3,
    options: FEELING_CARED_FOR_OPTIONS,
    selectionLimit: 3,
    reasonRules: multiOverlapRule(
      '你们感到被在乎的方式里，都有 {{labels_2}}。',
      3,
    ),
  },
  {
    key: 'ideal_date_style',
    prompt: '请选择你最喜欢的 3 种约会方式。',
    type: QuestionType.MULTI_SELECT,
    order: 20,
    weight: 2,
    options: IDEAL_DATE_STYLE_OPTIONS,
    selectionLimit: 3,
    reasonRules: multiOverlapRule(
      '你们都偏好 {{labels_2}} 这类约会方式。',
      2,
    ),
  },
  {
    key: 'shared_growth_topics',
    prompt: '如果长期相处，你更愿意一起投入哪 3 个方向？',
    type: QuestionType.MULTI_SELECT,
    order: 21,
    weight: 2,
    options: SHARED_GROWTH_TOPIC_OPTIONS,
    selectionLimit: 3,
    reasonRules: multiOverlapRule(
      '你们都愿意一起投入 {{labels_2}}。',
      2,
    ),
  },
  {
    key: 'future_picture',
    prompt: '你希望一段关系最终更像什么？请选择 3 项。',
    type: QuestionType.MULTI_SELECT,
    order: 22,
    weight: 2,
    options: FUTURE_PICTURE_OPTIONS,
    selectionLimit: 3,
    reasonRules: multiOverlapRule(
      '你们对关系未来的期待里，都包含 {{labels_2}}。',
      2,
    ),
  },
  {
    key: 'admired_partner_traits',
    prompt: '你最欣赏哪 3 种伴侣气质？',
    type: QuestionType.MULTI_SELECT,
    order: 23,
    weight: 1,
    options: ADMIRED_PARTNER_TRAIT_OPTIONS,
    selectionLimit: 3,
    reasonRules: multiOverlapRule(
      '你们欣赏的对象气质里，都有 {{labels_2}}。',
      1,
    ),
  },
  {
    key: 'small_happiness',
    prompt: '你最容易在哪 3 种小事里感到关系感？',
    type: QuestionType.MULTI_SELECT,
    order: 24,
    weight: 1,
    options: SMALL_HAPPINESS_OPTIONS,
    selectionLimit: 3,
    reasonRules: multiOverlapRule(
      '你们都容易在 {{labels_2}} 这种瞬间里感受到关系感。',
      1,
    ),
  },
];

async function ensureCurrentQuestionnaireVersion() {
  const existingVersion = await prisma.questionnaireVersion.findFirst({
    where: { isCurrent: true },
  });

  const version =
    existingVersion ??
    (await prisma.questionnaireVersion.create({
      data: {
        title: 'LiLink Core Compatibility Survey',
        description: 'A relationship-oriented compatibility questionnaire.',
        isCurrent: true,
      },
    }));

  if (!existingVersion) {
    await prisma.questionnaireVersion.updateMany({
      where: {
        id: {
          not: version.id,
        },
      },
      data: {
        isCurrent: false,
      },
    });
  }

  await prisma.questionnaireVersion.update({
    where: { id: version.id },
    data: {
      title: 'LiLink Core Compatibility Survey',
      description: 'A relationship-oriented compatibility questionnaire.',
      isCurrent: true,
    },
  });

  for (const question of QUESTIONNAIRE_DEFINITIONS) {
    await prisma.question.upsert({
      where: { key: question.key },
      update: {
        versionId: version.id,
        prompt: question.prompt,
        type: question.type,
        order: question.order,
        weight: question.weight,
        required: true,
        selectionLimit: question.selectionLimit ?? null,
        options: createOptions(question.options),
        reasonRules: question.reasonRules,
      },
      create: {
        versionId: version.id,
        key: question.key,
        prompt: question.prompt,
        type: question.type,
        order: question.order,
        weight: question.weight,
        required: true,
        selectionLimit: question.selectionLimit ?? null,
        options: createOptions(question.options),
        reasonRules: question.reasonRules,
      },
    });
  }

  await prisma.question.deleteMany({
    where: {
      versionId: version.id,
      key: {
        notIn: QUESTIONNAIRE_DEFINITIONS.map((question) => question.key),
      },
    },
  });

  return version;
}

const schools = [
  {
    name: '北京邮电大学玛丽女王海南学院',
    slug: 'bupt-qmul-hainan',
    description: '黎安试验区中外合作办学机构',
    domains: ['bupt.edu.cn', 'qmul.ac.uk'],
  },
  {
    name: '中国传媒大学海南国际学院',
    slug: 'cuc-hainan-international',
    description: '黎安试验区中外合作办学机构',
    domains: ['cuc.edu.cn', 'coventry.ac.uk'],
  },
  {
    name: '电子科技大学格拉斯哥海南学院',
    slug: 'uestc-glasgow-hainan',
    description: '黎安试验区中外合作办学机构',
    domains: ['uestc.edu.cn', 'gla.ac.uk', 'glasgow.ac.uk'],
  },
  {
    name: '北京体育大学阿尔伯塔国际休闲体育与旅游学院',
    slug: 'bsu-ualberta-hainan',
    description: '黎安试验区中外合作办学机构',
    domains: ['bsu.edu.cn', 'ualberta.ca'],
  },
  {
    name: '中央民族大学海南国际学院',
    slug: 'muc-hainan-international',
    description: '黎安试验区中外合作办学机构',
    domains: ['muc.edu.cn', 'mdx.ac.uk', 'live.mdx.ac.uk'],
  },
  {
    name: '海南比勒费尔德应用科学大学',
    slug: 'hainan-biuh',
    description: '黎安试验区境外高校独立办学项目',
    domains: ['hainan-biuh.edu.cn', 'hsbi.de'],
  },
  {
    name: '北京语言大学（黎安交流项目）',
    slug: 'blcu-lian-exchange',
    description: '政府公开提到的入园学习或交流院校',
    domains: ['blcu.edu.cn'],
  },
  {
    name: '长安大学（黎安交流项目）',
    slug: 'changan-lian-exchange',
    description: '政府公开提到的入园学习或交流院校',
    domains: ['chd.edu.cn'],
  },
  {
    name: '华北电力大学（黎安交流项目）',
    slug: 'ncepu-lian-exchange',
    description: '政府公开提到的入园学习或交流院校',
    domains: ['ncepu.edu.cn'],
  },
];

async function seedSchoolsAndDomains() {
  for (const school of schools) {
    const createdSchool = await prisma.school.upsert({
      where: { slug: school.slug },
      update: {
        name: school.name,
        description: school.description,
      },
      create: {
        name: school.name,
        slug: school.slug,
        description: school.description,
      },
    });

    for (const domain of school.domains) {
      await prisma.schoolDomain.upsert({
        where: { domain },
        update: {
          schoolId: createdSchool.id,
        },
        create: {
          domain,
          schoolId: createdSchool.id,
        },
      });
    }
  }
}

/** Schools + current questionnaire version only (no users, cycles, or responses). */
async function seedDefaultRepositoryData() {
    await seedSchoolsAndDomains();
  await ensureCurrentQuestionnaireVersion();
}

function seedScope(): 'full' | 'default' {
    const raw = process.env.SEED_SCOPE?.trim().toLowerCase();
    if (raw === 'default' || raw === 'repo') {
        return 'default';
    }
    return 'full';
}

async function main() {
    const scope = seedScope();

    await seedDefaultRepositoryData();
    if (scope === 'default') {
        console.log(
            '[seed] SEED_SCOPE=default: schools + questionnaire only; skipped match cycle and users.',
        );
        return;
    }

  const now = new Date();
  const revealAt = new Date(now);
  revealAt.setUTCDate(now.getUTCDate() + 7);
  revealAt.setUTCHours(13, 0, 0, 0);

  const participationDeadline = new Date(revealAt);
  participationDeadline.setUTCHours(11, 0, 0, 0);

  const codename = `launch-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;

  await prisma.matchCycle.upsert({
    where: { codename },
    update: {},
    create: {
      codename,
      participationDeadline,
      revealAt,
      status: 'OPEN',
      notes: 'Initial launch cycle',
    },
  });

  // Keep the launch cycle runnable for local seed runs (completed cycles skip demo user creation).
  await prisma.matchCycle.update({
    where: { codename },
    data: {
      status: 'OPEN',
      participationDeadline,
      revealAt,
      notes: 'Initial launch cycle',
    },
  });

  await seedMatchDemoAccounts(prisma);
}

const DEMO_MATCH_PASSWORD = 'TestDemo_LiLink_42!';

/** Named demos (Alice/Bob/Carol) + bulk synthetic users ≈ this many participants. */
const TARGET_SEED_PARTICIPANTS = 30;
const BULK_SEED_USER_COUNT = Math.max(0, TARGET_SEED_PARTICIPANTS - 3);

const ALL_HARD_LOOKS = [...HARD_MATCH_LOOKS];

/** Rotating one-liner intros for seed users (keeps mail / admin previews realistic). */
const SEED_ONE_LINER_ROTATION = [
  '理工背景，喜欢夜跑和科幻，慢热但好聊。',
  '人文方向，常去咖啡馆与小剧场，期待真诚轻松的相处。',
  '爱好摄影与徒步，愿意分享日常，节奏希望适中、好好沟通。',
  '实验课较多也偶尔撸猫，想找能一起规划周末的人。',
  '喜欢爵士乐与独立游戏，重视边界感与双向回应。',
  '健身和阅读穿插进行，择偶看重情绪稳定与表达直接。',
  '二次元和户外都沾一点，接受先从朋友慢慢了解。',
  '羽毛球与志愿者活动常参加，重视信任与守时。',
  '咖啡依赖型，聊天幽默一点会更投缘；喜欢把话说清楚。',
  '多数时候早睡早起，但周末可以疯一回；看重回音与尊重。',
  '跨校交流多，习惯先线上聊聊再看要不要见面。',
  '厨艺一般但爱探店，想遇到能一起尝鲜的对象。',
] as const;

function seedOneLinerIntroForBulkIndex(index: number): string {
  return SEED_ONE_LINER_ROTATION[index % SEED_ONE_LINER_ROTATION.length]!;
}

function optionAt<T extends string>(options: readonly T[], index: number): T {
  return options[index % options.length]!;
}

function pickWrappedOptions<T extends string>(
  options: readonly T[],
  start: number,
  count: number,
): T[] {
  return Array.from({ length: count }, (_, offset) => {
    return options[(start + offset) % options.length]!;
  });
}

function demoSoftAnswers(): Record<string, unknown> {
  return {
    relationship_intent: '认真稳定的关系',
    pace: '平衡',
    define_relationship_timing: '相处一段时间再确认',
    contact_frequency: '适中',
    weekend: '轻社交',
    communication: '先冷静再沟通',
    repair_style: '先安抚情绪',
    apology_expectation: '后续行动',
    outing_spend_style: '更希望 AA',
    career_relationship_balance: '尽量平衡',
    social_energy: '比较像我',
    emotional_openness: '比较像我',
    space_need: '看情况',
    novelty_need: '比较像我',
    values: ['真诚', '稳定', '责任感', '温柔'],
    green_flags: ['说到做到', '情绪稳定', '边界清楚'],
    red_flag_sensitivity: ['失联', '情绪爆炸', '不尊重边界'],
    support_need: ['陪我聊天', '带我放松', '明确表达在乎'],
    feeling_cared_for: ['记住细节', '稳定陪伴', '尊重我的节奏'],
    ideal_date_style: ['散步聊天', '探店吃饭', '短途出行'],
    shared_growth_topics: ['学业事业', '情绪成熟', '旅行体验'],
    future_picture: ['稳定陪伴', '个人成长', '共同目标'],
    admired_partner_traits: ['温柔耐心', '直接坦诚', '有边界感'],
    small_happiness: ['一起吃饭', '深夜长聊', '分享日常'],
  };
}

function bulkSoftAnswers(index: number): Record<string, unknown> {
  const offset = index % VALUE_POOL.length;

  return {
    relationship_intent: optionAt(RELATIONSHIP_INTENT_OPTIONS, index),
    pace: optionAt(PACE_OPTIONS, index + 1),
    define_relationship_timing: optionAt(
      DEFINE_RELATIONSHIP_TIMING_OPTIONS,
      index + 2,
    ),
    contact_frequency: optionAt(CONTACT_FREQUENCY_OPTIONS, index + 1),
    weekend: optionAt(WEEKEND_OPTIONS, index + 2),
    communication: optionAt(COMMUNICATION_OPTIONS, index),
    repair_style: optionAt(REPAIR_STYLE_OPTIONS, index + 1),
    apology_expectation: optionAt(APOLOGY_EXPECTATION_OPTIONS, index + 2),
    outing_spend_style: optionAt(OUTING_SPEND_OPTIONS, index + 3),
    career_relationship_balance: optionAt(
      CAREER_RELATIONSHIP_BALANCE_OPTIONS,
      index + 1,
    ),
    social_energy: optionAt(SCALE_OPTIONS, index),
    emotional_openness: optionAt(SCALE_OPTIONS, index + 1),
    space_need: optionAt(SCALE_OPTIONS, index + 2),
    novelty_need: optionAt(SCALE_OPTIONS, index + 3),
    values: pickWrappedOptions(VALUE_POOL, offset, 4),
    green_flags: pickWrappedOptions(GREEN_FLAG_OPTIONS, index, 3),
    red_flag_sensitivity: pickWrappedOptions(RED_FLAG_OPTIONS, index + 2, 3),
    support_need: pickWrappedOptions(SUPPORT_NEED_OPTIONS, index + 1, 3),
    feeling_cared_for: pickWrappedOptions(
      FEELING_CARED_FOR_OPTIONS,
      index + 2,
      3,
    ),
    ideal_date_style: pickWrappedOptions(IDEAL_DATE_STYLE_OPTIONS, index, 3),
    shared_growth_topics: pickWrappedOptions(
      SHARED_GROWTH_TOPIC_OPTIONS,
      index + 1,
      3,
    ),
    future_picture: pickWrappedOptions(FUTURE_PICTURE_OPTIONS, index + 2, 3),
    admired_partner_traits: pickWrappedOptions(
      ADMIRED_PARTNER_TRAIT_OPTIONS,
      index + 1,
      3,
    ),
    small_happiness: pickWrappedOptions(SMALL_HAPPINESS_OPTIONS, index, 3),
  };
}

function bulkHardAnswers(index: number): Record<string, unknown> {
  const pattern = index % 9;
  let gender: (typeof HARD_MATCH_GENDERS)[number];
  let partnerGenders: (typeof HARD_MATCH_GENDERS)[number][];
  if (pattern === 8) {
    gender = '非二元';
    partnerGenders = ['男', '女'];
  } else if (pattern % 2 === 0) {
    gender = '男';
    partnerGenders = ['女'];
  } else {
    gender = '女';
    partnerGenders = ['男'];
  }

  const year = 2000 + (index % 6);
  const month = 1 + (index % 12);
  const day = 1 + (index % 28);
  const birthDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  let partnerAgeMin = 19 + (index % 5);
  let partnerAgeMax = 31 + (index % 10);
  if (partnerAgeMax <= partnerAgeMin) {
    partnerAgeMax = partnerAgeMin + 8;
  }

  return {
    [HARD_MATCH_KEYS.birthDate]: birthDate,
    [HARD_MATCH_KEYS.partnerAgeMin]: partnerAgeMin,
    [HARD_MATCH_KEYS.partnerAgeMax]: partnerAgeMax,
    [HARD_MATCH_KEYS.gender]: gender,
    [HARD_MATCH_KEYS.partnerGenders]: partnerGenders,
    [HARD_MATCH_KEYS.looks]: HARD_MATCH_LOOKS[index % HARD_MATCH_LOOKS.length],
    [HARD_MATCH_KEYS.partnerLooks]: ALL_HARD_LOOKS,
    [HARD_MATCH_KEYS.heightCm]: Math.min(
      HARD_MATCH_HEIGHT_MAX_CM,
      Math.max(HARD_MATCH_HEIGHT_MIN_CM, 155 + (index % 30)),
    ),
    [HARD_MATCH_KEYS.partnerHeightMin]: Math.min(
      HARD_MATCH_HEIGHT_MAX_CM,
      Math.max(HARD_MATCH_HEIGHT_MIN_CM, 140 + (index % 10)),
    ),
    [HARD_MATCH_KEYS.partnerHeightMax]: Math.min(
      HARD_MATCH_HEIGHT_MAX_CM,
      Math.max(HARD_MATCH_HEIGHT_MIN_CM, 200 - (index % 10)),
    ),
    [HARD_MATCH_KEYS.oneLinerIntro]: seedOneLinerIntroForBulkIndex(index),
  };
}

function bulkCombinedAnswers(index: number): Record<string, unknown> {
  return { ...bulkSoftAnswers(index), ...bulkHardAnswers(index) };
}

type QuestionnaireSeedPreset =
  | 'omit'
  | 'draft_empty'
  | 'draft_soft_only'
  | 'submitted_full';

type BulkScenario = {
  questionnaire: QuestionnaireSeedPreset;
  participation: 'opted_in' | 'opted_out';
  userStatus: UserStatus;
  withSchool: boolean;
  withProfile: boolean;
  acceptTerms: boolean;
};

/** Deterministic mix so bulk rows cover common edge cases (pattern repeats every 10 users). */
function bulkScenarioAt(index: number): BulkScenario {
  switch (index % 10) {
    case 0:
    case 1:
      return {
        questionnaire: 'submitted_full',
        participation: 'opted_in',
        userStatus: UserStatus.ACTIVE,
        withSchool: true,
        withProfile: true,
        acceptTerms: true,
      };
    case 2:
      return {
        questionnaire: 'submitted_full',
        participation: 'opted_out',
        userStatus: UserStatus.ACTIVE,
        withSchool: true,
        withProfile: true,
        acceptTerms: true,
      };
    case 3:
      return {
        questionnaire: 'omit',
        participation: 'opted_in',
        userStatus: UserStatus.ACTIVE,
        withSchool: true,
        withProfile: true,
        acceptTerms: true,
      };
    case 4:
      return {
        questionnaire: 'omit',
        participation: 'opted_out',
        userStatus: UserStatus.ACTIVE,
        withSchool: true,
        withProfile: true,
        acceptTerms: true,
      };
    case 5:
      return {
        questionnaire: 'draft_empty',
        participation: 'opted_in',
        userStatus: UserStatus.ACTIVE,
        withSchool: true,
        withProfile: true,
        acceptTerms: true,
      };
    case 6:
      return {
        questionnaire: 'draft_soft_only',
        participation: 'opted_in',
        userStatus: UserStatus.ACTIVE,
        withSchool: true,
        withProfile: true,
        acceptTerms: true,
      };
    case 7:
      return {
        questionnaire: 'omit',
        participation: 'opted_out',
        userStatus: UserStatus.PENDING,
        withSchool: true,
        withProfile: false,
        acceptTerms: false,
      };
    case 8:
      return {
        questionnaire: 'submitted_full',
        participation: 'opted_in',
        userStatus: UserStatus.ACTIVE,
        withSchool: false,
        withProfile: true,
        acceptTerms: true,
      };
    case 9:
      return {
        questionnaire: 'omit',
        participation: 'opted_out',
        userStatus: UserStatus.SUSPENDED,
        withSchool: true,
        withProfile: false,
        acceptTerms: true,
      };
    default:
      return {
        questionnaire: 'submitted_full',
        participation: 'opted_in',
        userStatus: UserStatus.ACTIVE,
        withSchool: true,
        withProfile: true,
        acceptTerms: true,
      };
  }
}

type QuestionnaireSeedArg =
  | { mode: 'omit' }
  | { mode: 'draft'; answers: Prisma.InputJsonValue }
  | { mode: 'submitted'; answers: Prisma.InputJsonValue };

function questionnairePayloadForPreset(
  preset: QuestionnaireSeedPreset,
  index: number,
  fullAnswers: Record<string, unknown>,
): QuestionnaireSeedArg {
  switch (preset) {
    case 'omit':
      return { mode: 'omit' };
    case 'draft_empty':
      return { mode: 'draft', answers: {} };
    case 'draft_soft_only':
      return {
        mode: 'draft',
        answers: {
          ...bulkSoftAnswers(index),
          [HARD_MATCH_KEYS.oneLinerIntro]: seedOneLinerIntroForBulkIndex(index),
        } as Prisma.InputJsonValue,
      };
    case 'submitted_full':
      return {
        mode: 'submitted',
        answers: fullAnswers as Prisma.InputJsonValue,
      };
  }
}

async function upsertSeedUser(
  prisma: PrismaClient,
  input: {
    email: string;
    displayName: string;
    fullName: string | null;
    schoolId: string | null;
    userStatus: UserStatus;
    acceptTerms: boolean;
  },
  cycleId: string,
  questionnaireVersionId: string,
  passwordHash: string,
  questionnaire: QuestionnaireSeedArg,
  participation: 'opted_in' | 'opted_out',
) {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      passwordHash,
      status: input.userStatus,
      displayName: input.displayName,
      schoolId: input.schoolId,
      acceptedTermsAt: input.acceptTerms ? new Date() : null,
    },
    create: {
      email: input.email,
      passwordHash,
      status: input.userStatus,
      displayName: input.displayName,
      schoolId: input.schoolId,
      acceptedTermsAt: input.acceptTerms ? new Date() : null,
    },
  });

  if (input.fullName !== null) {
    await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: { fullName: input.fullName },
      create: { userId: user.id, fullName: input.fullName },
    });
  } else {
    await prisma.userProfile.deleteMany({ where: { userId: user.id } });
  }

  if (questionnaire.mode === 'omit') {
    await prisma.questionnaireResponse.deleteMany({
      where: { userId: user.id },
    });
  } else {
    await prisma.questionnaireResponse.upsert({
      where: { userId: user.id },
      update: {
        versionId: questionnaireVersionId,
        answers: questionnaire.answers,
        submittedAt: questionnaire.mode === 'submitted' ? new Date() : null,
      },
      create: {
        userId: user.id,
        versionId: questionnaireVersionId,
        answers: questionnaire.answers,
        submittedAt: questionnaire.mode === 'submitted' ? new Date() : null,
      },
    });
  }

  await prisma.cycleParticipation.upsert({
    where: {
      cycleId_userId: { cycleId, userId: user.id },
    },
    update: {
      status: participation === 'opted_in' ? 'OPTED_IN' : 'OPTED_OUT',
      optedInAt: participation === 'opted_in' ? new Date() : null,
    },
    create: {
      cycleId,
      userId: user.id,
      status: participation === 'opted_in' ? 'OPTED_IN' : 'OPTED_OUT',
      optedInAt: participation === 'opted_in' ? new Date() : null,
    },
  });
}

async function seedMatchDemoAccounts(prisma: PrismaClient) {
  const version = await prisma.questionnaireVersion.findFirst({
    where: { isCurrent: true },
  });

  if (!version) {
    console.warn('[seed] Skipping match demo users: no current questionnaire version.');
    return;
  }

  const cycle = await prisma.matchCycle.findFirst({
    where: { status: { in: ['OPEN', 'DRAFT'] } },
    orderBy: { revealAt: 'asc' },
  });

  if (!cycle) {
    console.warn('[seed] Skipping match demo users: no open or draft cycle.');
    return;
  }

  const [schoolBupt, schoolCuc, schoolUestc] = await Promise.all([
    prisma.school.findUnique({ where: { slug: 'bupt-qmul-hainan' } }),
    prisma.school.findUnique({ where: { slug: 'cuc-hainan-international' } }),
    prisma.school.findUnique({ where: { slug: 'uestc-glasgow-hainan' } }),
  ]);

  if (!schoolBupt || !schoolCuc || !schoolUestc) {
    console.warn('[seed] Skipping match demo users: expected schools missing.');
    return;
  }

  const questionnaireVersionId = version.id;
  const matchCycleId = cycle.id;

  const passwordHash = await argon2.hash(DEMO_MATCH_PASSWORD);
  const soft = demoSoftAnswers();
  const allLooks = [...HARD_MATCH_LOOKS];

  const aliceAnswers: Record<string, unknown> = {
    ...soft,
    [HARD_MATCH_KEYS.birthDate]: '2003-06-15',
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 35,
    [HARD_MATCH_KEYS.gender]: '男',
    [HARD_MATCH_KEYS.partnerGenders]: ['女'],
    [HARD_MATCH_KEYS.looks]: '普通人',
    [HARD_MATCH_KEYS.partnerLooks]: allLooks,
    [HARD_MATCH_KEYS.heightCm]: 178,
    [HARD_MATCH_KEYS.partnerHeightMin]: 150,
    [HARD_MATCH_KEYS.partnerHeightMax]: 185,
    [HARD_MATCH_KEYS.oneLinerIntro]:
      '工科背景，喜欢徒步与摄影，情绪稳定。（演示账号 Alice）',
  };

  const bobAnswers: Record<string, unknown> = {
    ...soft,
    [HARD_MATCH_KEYS.birthDate]: '2004-03-20',
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 35,
    [HARD_MATCH_KEYS.gender]: '女',
    [HARD_MATCH_KEYS.partnerGenders]: ['男'],
    [HARD_MATCH_KEYS.looks]: '小帅/美',
    [HARD_MATCH_KEYS.partnerLooks]: allLooks,
    [HARD_MATCH_KEYS.heightCm]: 165,
    [HARD_MATCH_KEYS.partnerHeightMin]: 168,
    [HARD_MATCH_KEYS.partnerHeightMax]: 195,
    [HARD_MATCH_KEYS.oneLinerIntro]:
      '文创方向，读书看电影，希望遇到温柔耐心、能接住情绪的人。（演示 Bob）',
  };

  const carolAnswers: Record<string, unknown> = {
    ...soft,
    [HARD_MATCH_KEYS.birthDate]: '2002-01-10',
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 45,
    [HARD_MATCH_KEYS.gender]: '女',
    // Only seeks women; cannot pair with Bob (Bob only accepts men) or Alice (Alice is male).
    [HARD_MATCH_KEYS.partnerGenders]: ['女'],
    [HARD_MATCH_KEYS.looks]: '普通人',
    [HARD_MATCH_KEYS.partnerLooks]: allLooks,
    [HARD_MATCH_KEYS.heightCm]: 162,
    [HARD_MATCH_KEYS.partnerHeightMin]: 155,
    [HARD_MATCH_KEYS.partnerHeightMax]: 180,
    [HARD_MATCH_KEYS.oneLinerIntro]:
      '常驻图书馆自习，想认识可以一起跑步或打球的朋友。（演示 Carol，未匹配示例）',
  };

  await upsertSeedUser(
    prisma,
    {
      email: 'matched.alice@bupt.edu.cn',
      displayName: '演示-Alice',
      fullName: 'Match Demo Alice',
      schoolId: schoolBupt.id,
      userStatus: UserStatus.ACTIVE,
      acceptTerms: true,
    },
    matchCycleId,
    questionnaireVersionId,
    passwordHash,
    { mode: 'submitted', answers: aliceAnswers as Prisma.InputJsonValue },
    'opted_in',
  );

  await upsertSeedUser(
    prisma,
    {
      email: 'matched.bob@cuc.edu.cn',
      displayName: '演示-Bob',
      fullName: 'Match Demo Bob',
      schoolId: schoolCuc.id,
      userStatus: UserStatus.ACTIVE,
      acceptTerms: true,
    },
    matchCycleId,
    questionnaireVersionId,
    passwordHash,
    { mode: 'submitted', answers: bobAnswers as Prisma.InputJsonValue },
    'opted_in',
  );

  await upsertSeedUser(
    prisma,
    {
      email: 'unmatched.carol@uestc.edu.cn',
      displayName: '演示-Carol',
      fullName: 'Match Demo Carol',
      schoolId: schoolUestc.id,
      userStatus: UserStatus.ACTIVE,
      acceptTerms: true,
    },
    matchCycleId,
    questionnaireVersionId,
    passwordHash,
    { mode: 'submitted', answers: carolAnswers as Prisma.InputJsonValue },
    'opted_in',
  );

  const schoolBySlug = new Map(
    (
      await prisma.school.findMany({
        where: { slug: { in: schools.map((s) => s.slug) } },
      })
    ).map((s) => [s.slug, s]),
  );

  for (let i = 0; i < BULK_SEED_USER_COUNT; i++) {
    const meta = schools[i % schools.length]!;
    const record = schoolBySlug.get(meta.slug);
    if (!record) {
      continue;
    }
    const scenario = bulkScenarioAt(i);
    const n = i + 1;
    const domain = meta.domains[0]!;
    const email = `seed.bulk.${String(n).padStart(2, '0')}@${domain}`;
    const fullAnswers = bulkCombinedAnswers(i);
    const q = questionnairePayloadForPreset(
      scenario.questionnaire,
      i,
      fullAnswers,
    );
    await upsertSeedUser(
      prisma,
      {
        email,
        displayName: `批量-${String(n).padStart(2, '0')}`,
        fullName: scenario.withProfile ? `Seed Bulk User ${n}` : null,
        schoolId: scenario.withSchool ? record.id : null,
        userStatus: scenario.userStatus,
        acceptTerms: scenario.acceptTerms,
      },
      matchCycleId,
      questionnaireVersionId,
      passwordHash,
      q,
      scenario.participation,
    );
  }

  console.log('');
  console.log(
    `--- Seed users: ${3 + BULK_SEED_USER_COUNT} total (password all): ${DEMO_MATCH_PASSWORD}`,
  );
  console.log('  Documented trio (full questionnaire, opted in):');
  console.log('    matched.alice@bupt.edu.cn');
  console.log('    matched.bob@cuc.edu.cn');
  console.log('    unmatched.carol@uestc.edu.cn');
  console.log(
    `  Bulk seed.bulk.01…${String(BULK_SEED_USER_COUNT).padStart(2, '0')}: mix of submitted / draft (soft + one-liner) / no response;`,
  );
  console.log(
    '    opted in vs out; ACTIVE vs PENDING; with or without schoolId (see bulkScenarioAt in prisma/seed.ts).',
  );
  console.log('  Login at /login with email + password (no email code for these users).');
  console.log('');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
