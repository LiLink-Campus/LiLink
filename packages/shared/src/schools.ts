import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from "./locale";

export const PUBLIC_SUPPORTED_SCHOOL_SLUGS = [
  "bupt-qmul-hainan",
  "muc-hainan-international",
  "bsu-ualberta-hainan",
  "blcu-lian-exchange",
  "uestc-glasgow-hainan",
  "cuc-hainan-international",
] as const;

export type PublicSupportedSchoolSlug =
  (typeof PUBLIC_SUPPORTED_SCHOOL_SLUGS)[number];

export type PublicSupportedSchoolProfile = {
  slug: PublicSupportedSchoolSlug;
  nativeName: string;
  englishName: string;
  nativeBaseName: string;
  englishBaseName: string;
  descriptionByLocale: Record<SupportedLocale, string>;
};

export type LocalizedPublicSupportedSchool = {
  slug: PublicSupportedSchoolSlug;
  name: string;
  nativeName: string;
  englishName: string;
  baseName: string;
  nativeBaseName: string;
  englishBaseName: string;
  description: string;
};

export const PUBLIC_SUPPORTED_SCHOOLS: readonly PublicSupportedSchoolProfile[] =
  [
    {
      slug: "bupt-qmul-hainan",
      nativeName: "北京邮电大学",
      englishName: "Beijing University of Posts and Telecommunications",
      nativeBaseName: "北京邮电大学",
      englishBaseName: "Beijing University of Posts and Telecommunications",
      descriptionByLocale: {
        "zh-CN": "黎安试验区中外合作办学机构",
        "en-US": "Sino-foreign cooperative institution in the Li'an pilot zone",
      },
    },
    {
      slug: "muc-hainan-international",
      nativeName: "中央民族大学",
      englishName: "Minzu University of China",
      nativeBaseName: "中央民族大学",
      englishBaseName: "Minzu University of China",
      descriptionByLocale: {
        "zh-CN": "黎安试验区合作高校",
        "en-US": "Partner university in the Li'an pilot zone",
      },
    },
    {
      slug: "bsu-ualberta-hainan",
      nativeName: "北京体育大学",
      englishName: "Beijing Sport University",
      nativeBaseName: "北京体育大学",
      englishBaseName: "Beijing Sport University",
      descriptionByLocale: {
        "zh-CN": "黎安试验区中外合作办学机构",
        "en-US": "Sino-foreign cooperative institution in the Li'an pilot zone",
      },
    },
    {
      slug: "blcu-lian-exchange",
      nativeName: "北京语言大学",
      englishName: "Beijing Language and Culture University",
      nativeBaseName: "北京语言大学",
      englishBaseName: "Beijing Language and Culture University",
      descriptionByLocale: {
        "zh-CN": "黎安交流项目支持学校",
        "en-US": "Supported school for the Li'an exchange program",
      },
    },
    {
      slug: "uestc-glasgow-hainan",
      nativeName: "电子科技大学",
      englishName: "University of Electronic Science and Technology of China",
      nativeBaseName: "电子科技大学",
      englishBaseName: "University of Electronic Science and Technology of China",
      descriptionByLocale: {
        "zh-CN": "黎安试验区中外合作办学机构",
        "en-US": "Sino-foreign cooperative institution in the Li'an pilot zone",
      },
    },
    {
      slug: "cuc-hainan-international",
      nativeName: "中国传媒大学",
      englishName: "Communication University of China",
      nativeBaseName: "中国传媒大学",
      englishBaseName: "Communication University of China",
      descriptionByLocale: {
        "zh-CN": "黎安试验区合作高校",
        "en-US": "Partner university in the Li'an pilot zone",
      },
    },
  ] as const;

const PUBLIC_SUPPORTED_SCHOOL_SLUG_SET = new Set<string>(
  PUBLIC_SUPPORTED_SCHOOL_SLUGS,
);

const PUBLIC_SUPPORTED_SCHOOL_BY_SLUG = new Map<
  string,
  PublicSupportedSchoolProfile
>(PUBLIC_SUPPORTED_SCHOOLS.map((school) => [school.slug, school]));

const PUBLIC_SUPPORTED_SCHOOL_SORT_INDEX = new Map<string, number>(
  PUBLIC_SUPPORTED_SCHOOL_SLUGS.map((slug, index) => [slug, index]),
);

export function isPublicSupportedSchoolSlug(
  slug: string,
): slug is PublicSupportedSchoolSlug {
  return PUBLIC_SUPPORTED_SCHOOL_SLUG_SET.has(slug);
}

export function publicSupportedSchoolSortIndex(slug: string): number {
  return PUBLIC_SUPPORTED_SCHOOL_SORT_INDEX.get(slug) ?? Number.MAX_SAFE_INTEGER;
}

export function getPublicSupportedSchoolProfile(
  slug: string,
): PublicSupportedSchoolProfile | null {
  return PUBLIC_SUPPORTED_SCHOOL_BY_SLUG.get(slug) ?? null;
}

export function localizePublicSupportedSchool(
  slug: string,
  locale: unknown = DEFAULT_LOCALE,
): LocalizedPublicSupportedSchool | null {
  const school = getPublicSupportedSchoolProfile(slug);
  if (!school) {
    return null;
  }

  const normalizedLocale = normalizeLocale(locale);
  return {
    slug: school.slug,
    name:
      normalizedLocale === "en-US" ? school.englishName : school.nativeName,
    nativeName: school.nativeName,
    englishName: school.englishName,
    baseName:
      normalizedLocale === "en-US"
        ? school.englishBaseName
        : school.nativeBaseName,
    nativeBaseName: school.nativeBaseName,
    englishBaseName: school.englishBaseName,
    description: school.descriptionByLocale[normalizedLocale],
  };
}
