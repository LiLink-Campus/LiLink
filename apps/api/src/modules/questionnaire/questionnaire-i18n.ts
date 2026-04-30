import { DEFAULT_LOCALE, type SupportedLocale } from '@lilink/shared';

type LocalizableQuestionnaire = {
  title: string;
  description: string | null;
  questions: Array<{
    key: string;
    prompt: string;
    description: string | null;
    options: Array<{ value: string; label: string }>;
  }>;
};

const QUESTION_PROMPTS_EN: Record<string, string> = {
  relationship_intent: 'What kind of relationship are you looking for?',
  pace: 'What relationship pace feels most comfortable to you?',
  define_relationship_timing: 'When do you prefer to define the relationship?',
  contact_frequency: 'What contact frequency feels closest to ideal?',
  weekend: 'Which weekend style feels closest to your ideal?',
  communication:
    'When disagreements happen, what do you hope the other person does?',
  repair_style:
    'After tension in a relationship, what repair style works best for you?',
  apology_expectation:
    'If the other person makes a mistake, what matters most to you?',
  outing_spend_style:
    'When going out together, what spending style do you prefer?',
  career_relationship_balance:
    'At this stage, how do you want to balance relationships and personal development?',
  social_energy:
    'Once we become familiar, I usually take initiative to keep contact and meet up.',
  emotional_openness:
    'In a relationship, I am willing to directly share my real emotions.',
  space_need: 'Even in a close relationship, I need stable time alone.',
  novelty_need: 'I want a relationship to keep having freshness and change.',
  values: 'Choose the 4 values you care about most.',
  green_flags: 'Choose the 3 green flags that move you most.',
  red_flag_sensitivity: 'Choose the 3 red flags you care about most.',
  support_need:
    'When you are not doing well, what 3 kinds of support do you need most?',
  feeling_cared_for: 'Which 3 actions most easily make you feel cared for?',
  ideal_date_style: 'Choose your 3 favorite date styles.',
  shared_growth_topics:
    'If you stay together long term, which 3 areas would you like to invest in together?',
  future_picture:
    'What do you hope a relationship eventually feels like? Choose 3.',
  admired_partner_traits: 'Which 3 partner qualities do you admire most?',
  small_happiness: 'Which 3 small moments most easily make you feel connected?',
};

const OPTION_LABELS_EN: Record<string, string> = {
  认真稳定的关系: 'A serious, stable relationship',
  先认真了解再决定: 'Understand each other seriously first',
  '轻松认识，顺其自然': 'Meet casually and let it develop',
  慢热: 'Slow to warm up',
  平衡: 'Balanced',
  主动推进: 'Proactive',
  熟悉后尽快明确: 'Define it soon after becoming familiar',
  相处一段时间再确认: 'Confirm after spending time together',
  不急着定义关系: 'No rush to define it',
  高互动: 'High interaction',
  适中: 'Moderate',
  保持留白: 'Leave some space',
  出门探索: 'Go out and explore',
  轻社交: 'Light social plans',
  安静恢复: 'Quiet recovery time',
  当场说清楚: 'Talk it through immediately',
  先冷静再沟通: 'Calm down before talking',
  给彼此缓冲时间: 'Give each other time to process',
  先讲清楚逻辑: 'Clarify the logic first',
  先安抚情绪: 'Soothe emotions first',
  先给空间再回来聊: 'Give space, then come back to talk',
  及时道歉: 'A timely apology',
  解释清楚: 'A clear explanation',
  后续行动: 'Follow-up action',
  '无所谓，看当时和心情': 'Flexible, depends on the moment',
  '更希望 AA': 'Prefer splitting evenly',
  更能接受对方多出或主动请客: 'Comfortable if the other person pays more',
  更愿意自己多出或主动请客: 'Willing to pay more myself',
  '不太希望总是只有我出钱（不强求对方全包）':
    'Do not want to always be the only one paying',
  感情优先: 'Prioritize the relationship',
  尽量平衡: 'Try to balance both',
  更看重学业或事业: 'Prioritize study or career',
  非常不像我: 'Strongly unlike me',
  比较不像我: 'Mostly unlike me',
  看情况: 'Depends',
  比较像我: 'Mostly like me',
  非常像我: 'Strongly like me',
  真诚: 'Sincerity',
  稳定: 'Stability',
  责任感: 'Responsibility',
  尊重边界: 'Respect for boundaries',
  好奇心: 'Curiosity',
  上进: 'Drive',
  温柔: 'Gentleness',
  幽默感: 'Sense of humor',
  说到做到: 'Keeps promises',
  情绪稳定: 'Emotionally steady',
  边界清楚: 'Clear boundaries',
  愿意表达: 'Willing to express',
  有上进心: 'Ambitious',
  会照顾人: 'Caring',
  松弛幽默: 'Relaxed and funny',
  冷处理: 'Silent treatment',
  阴阳怪气: 'Passive-aggressive comments',
  控制欲: 'Controlling behavior',
  失联: 'Disappearing',
  迟到失约: 'Being late or breaking plans',
  情绪爆炸: 'Emotional outbursts',
  不尊重边界: 'Disrespecting boundaries',
  陪我聊天: 'Talk with me',
  给出建议: 'Give advice',
  直接帮我做事: 'Help directly with tasks',
  带我放松: 'Help me relax',
  给我空间: 'Give me space',
  明确表达在乎: 'Clearly show care',
  及时回复: 'Reply in time',
  主动约我: 'Ask me out proactively',
  记住细节: 'Remember details',
  明确表达喜欢: 'Clearly express liking',
  实际照顾: 'Practical care',
  稳定陪伴: 'Steady companionship',
  尊重我的节奏: 'Respect my pace',
  散步聊天: 'Walk and talk',
  探店吃饭: 'Try cafes or restaurants',
  运动户外: 'Sports and outdoors',
  看展看电影: 'Exhibitions or movies',
  宅家陪伴: 'Stay in together',
  短途出行: 'Short trips',
  一起做正事: 'Work on serious things together',
  学业事业: 'Study or career',
  健身作息: 'Fitness and routines',
  情绪成熟: 'Emotional maturity',
  旅行体验: 'Travel experiences',
  审美兴趣: 'Aesthetic interests',
  社交拓展: 'Social expansion',
  财务规划: 'Financial planning',
  个人成长: 'Personal growth',
  经济安全: 'Financial security',
  自由感: 'A sense of freedom',
  家庭连接: 'Family connection',
  新鲜体验: 'Fresh experiences',
  共同目标: 'Shared goals',
  温柔耐心: 'Gentle and patient',
  有主见: 'Has their own views',
  自律可靠: 'Disciplined and reliable',
  直接坦诚: 'Direct and honest',
  有趣松弛: 'Fun and relaxed',
  有边界感: 'Has healthy boundaries',
  有行动力: 'Takes action',
  一起吃饭: 'Eating together',
  深夜长聊: 'Long late-night talks',
  散步吹风: 'Walking outside',
  一起学习: 'Studying together',
  肢体靠近: 'Physical closeness',
  分享日常: 'Sharing daily life',
  临时起意的小冒险: 'Spontaneous little adventures',
};

export function localizeQuestionnaire<T extends LocalizableQuestionnaire>(
  questionnaire: T,
  locale: SupportedLocale = DEFAULT_LOCALE,
): T {
  if (locale === DEFAULT_LOCALE) {
    return questionnaire;
  }

  return {
    ...questionnaire,
    title:
      questionnaire.title === 'Default Questionnaire'
        ? 'Default Questionnaire'
        : questionnaire.title,
    questions: questionnaire.questions.map((question) => ({
      ...question,
      prompt: QUESTION_PROMPTS_EN[question.key] ?? question.prompt,
      options: question.options.map((option) => ({
        ...option,
        label: OPTION_LABELS_EN[option.value] ?? option.label,
      })),
    })),
  };
}
