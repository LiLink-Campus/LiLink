import 'dotenv/config';
import { PrismaClient, QuestionType } from "@prisma/client";

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

async function main() {
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

  const existingVersion = await prisma.questionnaireVersion.findFirst({
    where: { isCurrent: true },
  });

  if (!existingVersion) {
    await prisma.questionnaireVersion.create({
      data: {
        title: "LiLink Core Compatibility Survey",
        description: "A compact first-pass questionnaire for the initial launch.",
        isCurrent: true,
        questions: {
          create: [
            {
              key: "relationship_intent",
              prompt: "你更想进入一段怎样的关系？",
              type: QuestionType.SINGLE_SELECT,
              order: 1,
              weight: 3,
              options: [
                "认真稳定的关系",
                "先认识、慢慢发展",
                "保持开放，顺其自然",
              ],
            },
            {
              key: "pace",
              prompt: "你更偏好的相处节奏是？",
              type: QuestionType.SINGLE_SELECT,
              order: 2,
              weight: 2,
              options: ["慢热", "平衡", "主动推进"],
            },
            {
              key: "values",
              prompt: "从下面选出你最看重的四项价值。",
              type: QuestionType.MULTI_SELECT,
              order: 3,
              weight: 4,
              options: [
                "真诚",
                "独立",
                "稳定",
                "好奇心",
                "责任感",
                "幽默感",
                "野心",
                "温柔",
              ],
            },
            {
              key: "weekend",
              prompt: "理想周末更接近哪一种？",
              type: QuestionType.SINGLE_SELECT,
              order: 4,
              weight: 2,
              options: ["出门探索", "轻社交", "安静恢复"],
            },
            {
              key: "communication",
              prompt: "发生分歧时，你更希望对方怎么做？",
              type: QuestionType.SINGLE_SELECT,
              order: 5,
              weight: 3,
              options: ["当场说清楚", "先冷静再沟通", "给彼此缓冲时间"],
            },
            {
              key: "cross_school",
              prompt: "跨校认识对你来说是加分项吗？",
              type: QuestionType.SINGLE_SELECT,
              order: 6,
              weight: 1,
              options: ["是", "无所谓", "更希望校内优先"],
            },
            {
              key: "boundaries",
              prompt: "你最在意的一条边界是什么？",
              type: QuestionType.SHORT_TEXT,
              order: 7,
              weight: 2,
            },
          ],
        },
      },
    });
  }

  const existingCycle = await prisma.matchCycle.findFirst({
    where: { status: { in: ["OPEN", "DRAFT"] } },
  });

  if (!existingCycle) {
    const now = new Date();
    const revealAt = new Date(now);
    revealAt.setUTCDate(now.getUTCDate() + 7);
    revealAt.setUTCHours(13, 0, 0, 0);

    const participationDeadline = new Date(revealAt);
    participationDeadline.setUTCHours(11, 0, 0, 0);

    await prisma.matchCycle.create({
      data: {
        codename: `launch-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
        participationDeadline,
        revealAt,
        status: "OPEN",
        notes: "Initial launch cycle",
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
