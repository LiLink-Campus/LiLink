import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

function createOptions(labels) {
  return labels.map((label) => ({ value: label, label }));
}

function exactMatchRule(template, priority) {
  return [{ type: 'EXACT_MATCH', template, priority }];
}

function multiOverlapRule(template, priority, maxLabels = 2, minOverlap = 1) {
  return [{ type: 'MULTI_OVERLAP', template, priority, maxLabels, minOverlap }];
}

const QUESTIONNAIRE_DEFINITIONS = [
  {
    key: 'relationship_intent',
    prompt: '你更想进入一段怎样的关系？',
    type: 'SINGLE_SELECT',
    order: 1,
    weight: 4,
    options: ['认真稳定的关系', '先认真了解再决定', '轻松认识，顺其自然'],
    reasonRules: exactMatchRule('你们对进入关系的预期都偏向 {{answer_label}}。', 4),
  },
  {
    key: 'pace',
    prompt: '你更舒服的关系推进节奏是？',
    type: 'SINGLE_SELECT',
    order: 2,
    weight: 3,
    options: ['慢热', '平衡', '主动推进'],
    reasonRules: exactMatchRule('你们都更接受 {{answer_label}} 的推进节奏。', 3),
  },
  {
    key: 'define_relationship_timing',
    prompt: '你更接受什么时候明确关系？',
    type: 'SINGLE_SELECT',
    order: 3,
    weight: 3,
    options: ['熟悉后尽快明确', '相处一段时间再确认', '不急着定义关系'],
    reasonRules: exactMatchRule('你们对"什么时候确认关系"的想法比较接近。', 3),
  },
  {
    key: 'contact_frequency',
    prompt: '你理想中的联系频率更接近哪一种？',
    type: 'SINGLE_SELECT',
    order: 4,
    weight: 3,
    options: ['高互动', '适中', '保持留白'],
    reasonRules: exactMatchRule('你们都舒服于 {{answer_label}} 的联系频率。', 3),
  },
  {
    key: 'weekend',
    prompt: '理想周末更接近哪一种？',
    type: 'SINGLE_SELECT',
    order: 5,
    weight: 2,
    options: ['出门探索', '轻社交', '安静恢复'],
    reasonRules: exactMatchRule('你们都更喜欢 {{answer_label}} 的周末状态。', 2),
  },
  {
    key: 'communication',
    prompt: '发生分歧时，你更希望对方怎么做？',
    type: 'SINGLE_SELECT',
    order: 6,
    weight: 4,
    options: ['当场说清楚', '先冷静再沟通', '给彼此缓冲时间'],
    reasonRules: exactMatchRule('你们处理分歧时，都更接受 {{answer_label}}。', 4),
  },
  {
    key: 'repair_style',
    prompt: '关系里闹别扭后，你更吃哪种修复方式？',
    type: 'SINGLE_SELECT',
    order: 7,
    weight: 4,
    options: ['先讲清楚逻辑', '先安抚情绪', '先给空间再回来聊'],
    reasonRules: exactMatchRule('你们对冲突后的修复方式比较一致。', 4),
  },
  {
    key: 'apology_expectation',
    prompt: '如果对方做错了事，你更看重哪一点？',
    type: 'SINGLE_SELECT',
    order: 8,
    weight: 3,
    options: ['及时道歉', '解释清楚', '后续行动'],
    reasonRules: exactMatchRule('你们都更在意 {{answer_label}}。', 3),
  },
  {
    key: 'outing_spend_style',
    prompt: '一起出去玩时，花钱方式你更倾向哪一种？',
    type: 'SINGLE_SELECT',
    order: 9,
    weight: 2,
    options: [
      '无所谓，看当时和心情',
      '更希望 AA',
      '更能接受对方多出或主动请客',
      '更愿意自己多出或主动请客',
      '不太希望总是只有我出钱（不强求对方全包）',
    ],
    reasonRules: exactMatchRule('你们对出去玩时谁来买单或 AA 的期待比较一致，相处时更省心。', 2),
  },
  {
    key: 'career_relationship_balance',
    prompt: '现阶段你更希望感情和个人发展怎么平衡？',
    type: 'SINGLE_SELECT',
    order: 10,
    weight: 2,
    options: ['感情优先', '尽量平衡', '更看重学业或事业'],
    reasonRules: exactMatchRule('你们对当前阶段重心的判断接近。', 2),
  },
  {
    key: 'social_energy',
    prompt: '熟起来以后，我通常会主动推进联系和见面。',
    type: 'SCALE',
    order: 11,
    weight: 2,
    options: ['非常不像我', '比较不像我', '看情况', '比较像我', '非常像我'],
    reasonRules: exactMatchRule('你们在主动推进关系这件事上的倾向比较接近。', 2),
  },
  {
    key: 'emotional_openness',
    prompt: '在关系里，我愿意把自己的真实情绪直接说出来。',
    type: 'SCALE',
    order: 12,
    weight: 2,
    options: ['非常不像我', '比较不像我', '看情况', '比较像我', '非常像我'],
    reasonRules: exactMatchRule('你们在表达真实情绪这件事上的习惯比较接近。', 2),
  },
  {
    key: 'space_need',
    prompt: '即使关系亲密，我也需要稳定的独处空间。',
    type: 'SCALE',
    order: 13,
    weight: 2,
    options: ['非常不像我', '比较不像我', '看情况', '比较像我', '非常像我'],
    reasonRules: exactMatchRule('你们对亲密和个人空间的边界感比较接近。', 2),
  },
  {
    key: 'novelty_need',
    prompt: '我希望关系里持续有新鲜感和变化。',
    type: 'SCALE',
    order: 14,
    weight: 2,
    options: ['非常不像我', '比较不像我', '看情况', '比较像我', '非常像我'],
    reasonRules: exactMatchRule('你们对关系中新鲜感的偏好比较接近。', 2),
  },
  {
    key: 'values',
    prompt: '请选择你最看重的 4 项价值。',
    type: 'MULTI_SELECT',
    order: 15,
    weight: 4,
    options: ['真诚', '稳定', '责任感', '尊重边界', '好奇心', '上进', '温柔', '幽默感'],
    selectionLimit: 4,
    reasonRules: multiOverlapRule('你们都把 {{labels_2}} 放在重要位置。', 4),
  },
  {
    key: 'green_flags',
    prompt: '请选择最能打动你的 3 个"加分项"。',
    type: 'MULTI_SELECT',
    order: 16,
    weight: 3,
    options: ['说到做到', '情绪稳定', '边界清楚', '愿意表达', '有上进心', '会照顾人', '松弛幽默'],
    selectionLimit: 3,
    reasonRules: multiOverlapRule('你们都会被 {{labels_2}} 这类特质打动。', 3),
  },
  {
    key: 'red_flag_sensitivity',
    prompt: '请选择你最在意的 3 个"雷点"。',
    type: 'MULTI_SELECT',
    order: 17,
    weight: 3,
    options: ['冷处理', '阴阳怪气', '控制欲', '失联', '迟到失约', '情绪爆炸', '不尊重边界'],
    selectionLimit: 3,
    reasonRules: multiOverlapRule('你们都对 {{labels_2}} 这类相处问题比较敏感。', 3),
  },
  {
    key: 'support_need',
    prompt: '当你状态不好时，你最需要哪 3 种支持？',
    type: 'MULTI_SELECT',
    order: 18,
    weight: 3,
    options: ['陪我聊天', '给出建议', '直接帮我做事', '带我放松', '给我空间', '明确表达在乎'],
    selectionLimit: 3,
    reasonRules: multiOverlapRule('你们需要的支持方式里，都包含 {{labels_2}}。', 3),
  },
  {
    key: 'feeling_cared_for',
    prompt: '你最容易从哪 3 种行为里感到被在乎？',
    type: 'MULTI_SELECT',
    order: 19,
    weight: 3,
    options: ['及时回复', '主动约我', '记住细节', '明确表达喜欢', '实际照顾', '稳定陪伴', '尊重我的节奏'],
    selectionLimit: 3,
    reasonRules: multiOverlapRule('你们感到被在乎的方式里，都有 {{labels_2}}。', 3),
  },
  {
    key: 'ideal_date_style',
    prompt: '请选择你最喜欢的 3 种约会方式。',
    type: 'MULTI_SELECT',
    order: 20,
    weight: 2,
    options: ['散步聊天', '探店吃饭', '运动户外', '看展看电影', '宅家陪伴', '短途出行', '一起做正事'],
    selectionLimit: 3,
    reasonRules: multiOverlapRule('你们都偏好 {{labels_2}} 这类约会方式。', 2),
  },
  {
    key: 'shared_growth_topics',
    prompt: '如果长期相处，你更愿意一起投入哪 3 个方向？',
    type: 'MULTI_SELECT',
    order: 21,
    weight: 2,
    options: ['学业事业', '健身作息', '情绪成熟', '旅行体验', '审美兴趣', '社交拓展', '财务规划'],
    selectionLimit: 3,
    reasonRules: multiOverlapRule('你们都愿意一起投入 {{labels_2}}。', 2),
  },
  {
    key: 'future_picture',
    prompt: '你希望一段关系最终更像什么？请选择 3 项。',
    type: 'MULTI_SELECT',
    order: 22,
    weight: 2,
    options: ['稳定陪伴', '个人成长', '经济安全', '自由感', '家庭连接', '新鲜体验', '共同目标'],
    selectionLimit: 3,
    reasonRules: multiOverlapRule('你们对关系未来的期待里，都包含 {{labels_2}}。', 2),
  },
  {
    key: 'admired_partner_traits',
    prompt: '你最欣赏哪 3 种伴侣气质？',
    type: 'MULTI_SELECT',
    order: 23,
    weight: 1,
    options: ['温柔耐心', '有主见', '自律可靠', '直接坦诚', '有趣松弛', '有边界感', '有行动力'],
    selectionLimit: 3,
    reasonRules: multiOverlapRule('你们欣赏的对象气质里，都有 {{labels_2}}。', 1),
  },
  {
    key: 'small_happiness',
    prompt: '你最容易在哪 3 种小事里感到关系感？',
    type: 'MULTI_SELECT',
    order: 24,
    weight: 1,
    options: ['一起吃饭', '深夜长聊', '散步吹风', '一起学习', '肢体靠近', '分享日常', '临时起意的小冒险'],
    selectionLimit: 3,
    reasonRules: multiOverlapRule('你们都容易在 {{labels_2}} 这种瞬间里感受到关系感。', 1),
  },
];

async function seedSchools() {
  let schoolCount = 0;
  let domainCount = 0;

  for (const school of schools) {
    const created = await prisma.school.upsert({
      where: { slug: school.slug },
      update: { name: school.name, description: school.description },
      create: { name: school.name, slug: school.slug, description: school.description },
    });
    schoolCount++;

    for (const domain of school.domains) {
      await prisma.schoolDomain.upsert({
        where: { domain },
        update: { schoolId: created.id },
        create: { domain, schoolId: created.id },
      });
      domainCount++;
    }
  }

  console.log(`[seed-defaults] Schools: ${schoolCount} upserted, ${domainCount} domains.`);
}

async function seedQuestionnaire() {
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
      where: { id: { not: version.id } },
      data: { isCurrent: false },
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

  for (const q of QUESTIONNAIRE_DEFINITIONS) {
    const optionsPayload = createOptions(q.options);
    await prisma.question.upsert({
      where: { versionId_key: { versionId: version.id, key: q.key } },
      update: {
        versionId: version.id,
        prompt: q.prompt,
        type: q.type,
        order: q.order,
        weight: q.weight,
        required: true,
        selectionLimit: q.selectionLimit ?? null,
        options: optionsPayload,
        reasonRules: q.reasonRules,
      },
      create: {
        versionId: version.id,
        key: q.key,
        prompt: q.prompt,
        type: q.type,
        order: q.order,
        weight: q.weight,
        required: true,
        selectionLimit: q.selectionLimit ?? null,
        options: optionsPayload,
        reasonRules: q.reasonRules,
      },
    });
  }

  await prisma.question.deleteMany({
    where: {
      versionId: version.id,
      key: { notIn: QUESTIONNAIRE_DEFINITIONS.map((q) => q.key) },
    },
  });

  console.log(`[seed-defaults] Questionnaire: ${QUESTIONNAIRE_DEFINITIONS.length} questions synced (version: ${version.id}).`);
}

async function seedMatchCycle() {
  const now = new Date();
  const revealAt = new Date(now);
  revealAt.setUTCDate(now.getUTCDate() + 7);
  revealAt.setUTCHours(13, 0, 0, 0);

  const participationDeadline = new Date(revealAt);
  participationDeadline.setUTCHours(11, 0, 0, 0);

  const codename = `launch-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;

  const cycle = await prisma.matchCycle.upsert({
    where: { codename },
    update: {
      status: 'OPEN',
      participationDeadline,
      revealAt,
      notes: 'Initial launch cycle',
    },
    create: {
      codename,
      participationDeadline,
      revealAt,
      status: 'OPEN',
      notes: 'Initial launch cycle',
    },
  });

  console.log(`[seed-defaults] Match cycle: "${codename}" (status=OPEN, reveal=${revealAt.toISOString()}).`);
}

async function main() {
  console.log('[seed-defaults] Seeding schools, questionnaire, and match cycle...');
  await seedSchools();
  await seedQuestionnaire();
  await seedMatchCycle();
  console.log('[seed-defaults] Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
