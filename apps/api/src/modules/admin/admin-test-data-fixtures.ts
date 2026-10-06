export const softBase = {
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
const allLooks = ['普通人', '小帅/美', '顶帅/美'];

export const namedUsers = [
  {
    email: 'matched.alice@bupt.edu.cn',
    displayName: '演示-Alice',
    fullName: 'Match Demo Alice',
    schoolSlug: 'bupt-qmul-hainan',
    hard: {
      hard_birth_date: '2003-06-15',
      hard_partner_age_min: 20,
      hard_partner_age_max: 35,
      hard_gender: '男',
      hard_partner_genders: ['女'],
      hard_looks: '普通人',
      hard_partner_looks: allLooks,
      hard_height_cm: 178,
      hard_partner_height_min: 150,
      hard_partner_height_max: 185,
      hard_one_liner_intro:
        '工科背景，喜欢徒步与摄影，情绪稳定。（演示账号 Alice）',
    },
  },
  {
    email: 'matched.bob@cuc.edu.cn',
    displayName: '演示-Bob',
    fullName: 'Match Demo Bob',
    schoolSlug: 'cuc-hainan-international',
    hard: {
      hard_birth_date: '2004-03-20',
      hard_partner_age_min: 20,
      hard_partner_age_max: 35,
      hard_gender: '女',
      hard_partner_genders: ['男'],
      hard_looks: '小帅/美',
      hard_partner_looks: allLooks,
      hard_height_cm: 165,
      hard_partner_height_min: 168,
      hard_partner_height_max: 195,
      hard_one_liner_intro:
        '文创方向，读书看电影，希望遇到温柔耐心的人。（演示 Bob）',
    },
  },
  {
    email: 'unmatched.carol@uestc.edu.cn',
    displayName: '演示-Carol',
    fullName: 'Match Demo Carol',
    schoolSlug: 'uestc-glasgow-hainan',
    hard: {
      hard_birth_date: '2002-01-10',
      hard_partner_age_min: 20,
      hard_partner_age_max: 45,
      hard_gender: '女',
      hard_partner_genders: ['女'],
      hard_looks: '普通人',
      hard_partner_looks: allLooks,
      hard_height_cm: 162,
      hard_partner_height_min: 155,
      hard_partner_height_max: 180,
      hard_one_liner_intro:
        '常驻图书馆自习，想找能一起跑步的朋友。（演示 Carol，未匹配示例）',
    },
  },
];

export const BULK_COUNT = 27;
const SOFT_SINGLE_POOLS = {
  relationship_intent: [
    '认真稳定的关系',
    '先认真了解再决定',
    '轻松认识，顺其自然',
  ],
  pace: ['慢热', '平衡', '主动推进'],
  define_relationship_timing: [
    '熟悉后尽快明确',
    '相处一段时间再确认',
    '不急着定义关系',
  ],
  contact_frequency: ['高互动', '适中', '保持留白'],
  weekend: ['出门探索', '轻社交', '安静恢复'],
  communication: ['当场说清楚', '先冷静再沟通', '给彼此缓冲时间'],
  repair_style: ['先讲清楚逻辑', '先安抚情绪', '先给空间再回来聊'],
  apology_expectation: ['及时道歉', '解释清楚', '后续行动'],
  outing_spend_style: [
    '无所谓，看当时和心情',
    '更希望 AA',
    '更能接受对方多出或主动请客',
  ],
  career_relationship_balance: ['感情优先', '尽量平衡', '更看重学业或事业'],
  social_energy: ['非常不像我', '比较不像我', '看情况', '比较像我', '非常像我'],
  emotional_openness: [
    '非常不像我',
    '比较不像我',
    '看情况',
    '比较像我',
    '非常像我',
  ],
  space_need: ['非常不像我', '比较不像我', '看情况', '比较像我', '非常像我'],
  novelty_need: ['非常不像我', '比较不像我', '看情况', '比较像我', '非常像我'],
};
const SOFT_MULTI_POOLS = {
  values: [
    '真诚',
    '稳定',
    '责任感',
    '尊重边界',
    '好奇心',
    '上进',
    '温柔',
    '幽默感',
  ],
  green_flags: [
    '说到做到',
    '情绪稳定',
    '边界清楚',
    '愿意表达',
    '有上进心',
    '会照顾人',
    '松弛幽默',
  ],
  red_flag_sensitivity: [
    '冷处理',
    '阴阳怪气',
    '控制欲',
    '失联',
    '迟到失约',
    '情绪爆炸',
    '不尊重边界',
  ],
  support_need: [
    '陪我聊天',
    '给出建议',
    '直接帮我做事',
    '带我放松',
    '给我空间',
    '明确表达在乎',
  ],
  feeling_cared_for: [
    '及时回复',
    '主动约我',
    '记住细节',
    '明确表达喜欢',
    '实际照顾',
    '稳定陪伴',
    '尊重我的节奏',
  ],
  ideal_date_style: [
    '散步聊天',
    '探店吃饭',
    '运动户外',
    '看展看电影',
    '宅家陪伴',
    '短途出行',
    '一起做正事',
  ],
  shared_growth_topics: [
    '学业事业',
    '健身作息',
    '情绪成熟',
    '旅行体验',
    '审美兴趣',
    '社交拓展',
    '财务规划',
  ],
  future_picture: [
    '稳定陪伴',
    '个人成长',
    '经济安全',
    '自由感',
    '家庭连接',
    '新鲜体验',
    '共同目标',
  ],
  admired_partner_traits: [
    '温柔耐心',
    '有主见',
    '自律可靠',
    '直接坦诚',
    '有趣松弛',
    '有边界感',
    '有行动力',
  ],
  small_happiness: [
    '一起吃饭',
    '深夜长聊',
    '散步吹风',
    '一起学习',
    '肢体靠近',
    '分享日常',
    '临时起意的小冒险',
  ],
};

const pick = <T>(arr: readonly T[], idx: number): T => arr[idx % arr.length];
const pickN = <T>(arr: readonly T[], start: number, n: number): T[] =>
  Array.from({ length: n }, (_, off) => arr[(start + off) % arr.length]);

export function buildBulkAnswers(i: number): Record<string, unknown> {
  const soft: Record<string, unknown> = {};
  for (const [key, pool] of Object.entries(SOFT_SINGLE_POOLS)) {
    soft[key] = pick(pool, i);
  }
  for (const [key, pool] of Object.entries(SOFT_MULTI_POOLS)) {
    soft[key] = pickN(pool, i, key === 'values' ? 4 : 3);
  }
  const gender = i % 2 === 0 ? '男' : '女';
  const partnerGenders = gender === '男' ? ['女'] : ['男'];
  soft.hard_birth_date = `${2000 + (i % 6)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
  soft.hard_partner_age_min = 18;
  soft.hard_partner_age_max = 40;
  soft.hard_gender = gender;
  soft.hard_partner_genders = partnerGenders;
  soft.hard_looks = pick(allLooks, i);
  soft.hard_partner_looks = allLooks;
  soft.hard_height_cm = Math.min(230, Math.max(120, 155 + (i % 30)));
  soft.hard_partner_height_min = 120;
  soft.hard_partner_height_max = 230;
  soft.hard_one_liner_intro = pick(
    [
      '理工背景，喜欢夜跑和科幻。',
      '人文方向，常去咖啡馆。',
      '爱好摄影与徒步。',
      '实验课较多也偶尔撸猫。',
      '喜欢爵士乐与独立游戏。',
      '健身和阅读穿插进行。',
    ],
    i,
  );
  return soft;
}
