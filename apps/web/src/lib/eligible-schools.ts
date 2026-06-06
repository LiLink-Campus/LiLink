import { getClientApiBaseUrl } from "./api-base-url";

export type EligibleSchool = {
  id: string;
  name: string;
  description: string | null;
  domains: string[];
};

export type EligibleSchoolsPayload = {
  schools: EligibleSchool[];
  totalSchoolCount: number;
  totalDomainCount: number;
  generatedAt: string;
};

type RegistrationEligibleSchool = {
  name: string;
  displayName: string;
  description: string;
  domains: string[];
  matchNames: string[];
};

const REGISTRATION_ELIGIBLE_SCHOOLS: RegistrationEligibleSchool[] = [
  {
    name: "中国传媒大学海南国际学院",
    displayName: "中国传媒大学",
    description: "黎安试验区中外合作办学机构",
    domains: ["coventry.ac.uk", "cuc.cn", "cuc.edu.cn"],
    matchNames: ["中国传媒大学海南国际学院"],
  },
  {
    name: "中央民族大学海南国际学院",
    displayName: "中央民族大学",
    description: "黎安试验区中外合作办学机构",
    domains: ["live.mdx.ac.uk", "mdx.ac.uk", "muc.cn", "muc.edu.cn"],
    matchNames: ["中央民族大学海南国际学院"],
  },
  {
    name: "北京体育大学阿尔伯塔国际休闲体育学院",
    displayName: "北京体育大学",
    description: "黎安试验区中外合作办学机构",
    domains: ["bsu.cn", "bsu.edu.cn", "ualberta.ca"],
    matchNames: [
      "北京体育大学阿尔伯塔国际休闲体育学院",
      "北京体育大学阿尔伯塔国际休闲体育与旅游学院",
    ],
  },
  {
    name: "北京语言大学（黎安交流项目）",
    displayName: "北京语言大学",
    description: "政府公开提到的入园学习或交流院校",
    domains: ["blcu.cn", "blcu.edu.cn"],
    matchNames: ["北京语言大学（黎安交流项目）"],
  },
  {
    name: "北京邮电大学玛丽女王海南学院",
    displayName: "北京邮电大学",
    description: "黎安试验区中外合作办学机构",
    domains: ["bupt.cn", "bupt.edu.cn", "qmul.ac.uk"],
    matchNames: ["北京邮电大学玛丽女王海南学院"],
  },
  {
    name: "电子科技大学格拉斯哥海南学院",
    displayName: "电子科技大学",
    description: "黎安试验区中外合作办学机构",
    domains: ["gla.ac.uk", "glasgow.ac.uk", "uestc.cn", "uestc.edu.cn"],
    matchNames: ["电子科技大学格拉斯哥海南学院"],
  },
];

function findSourceSchool(
  schools: readonly EligibleSchool[],
  expected: RegistrationEligibleSchool,
) {
  const expectedDomains = new Set(
    expected.domains.map((domain) => domain.toLowerCase()),
  );

  return schools.find((school) => {
    if (expected.matchNames.includes(school.name)) {
      return true;
    }

    return school.domains.some((domain) =>
      expectedDomains.has(domain.toLowerCase()),
    );
  });
}

export function normalizeRegistrationEligibleSchoolsPayload(
  payload: EligibleSchoolsPayload,
): EligibleSchoolsPayload {
  const schools = REGISTRATION_ELIGIBLE_SCHOOLS.flatMap((expected) => {
    const sourceSchool = findSourceSchool(payload.schools, expected);
    if (!sourceSchool) {
      return [];
    }

    return [
      {
        id: sourceSchool.id,
        name: expected.displayName,
        description: expected.description,
        domains: expected.domains,
      },
    ];
  });

  return {
    ...payload,
    schools,
    totalSchoolCount: schools.length,
    totalDomainCount: schools.reduce(
      (count, school) => count + school.domains.length,
      0,
    ),
  };
}

export function extractEmailDomain(rawEmail: string): string | null {
  const normalized = rawEmail.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");

  if (atIndex === -1 || atIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(atIndex + 1);
}

export function isEmailMatchedByRegistrationAllowlist(rawEmail: string) {
  const emailDomain = extractEmailDomain(rawEmail);
  if (!emailDomain) {
    return false;
  }

  return REGISTRATION_ELIGIBLE_SCHOOLS.some((school) =>
    school.domains.some((domain) => {
      const normalizedDomain = domain.toLowerCase();
      return (
        emailDomain === normalizedDomain ||
        emailDomain.endsWith(`.${normalizedDomain}`)
      );
    }),
  );
}

export function findMatchingSchool(
  schools: readonly EligibleSchool[],
  rawEmail: string,
): { school: EligibleSchool; matchedDomain: string } | null {
  const emailDomain = extractEmailDomain(rawEmail);
  if (!emailDomain) {
    return null;
  }

  const candidates = schools
    .flatMap((school) =>
      school.domains.map((domain) => ({ school, domain: domain.toLowerCase() })),
    )
    .filter(
      ({ domain }) =>
        emailDomain === domain || emailDomain.endsWith(`.${domain}`),
    )
    .sort((left, right) => right.domain.length - left.domain.length);

  const match = candidates[0];
  if (!match) {
    return null;
  }

  return { school: match.school, matchedDomain: match.domain };
}

export async function fetchEligibleSchools(): Promise<EligibleSchoolsPayload> {
  const response = await fetch(`${getClientApiBaseUrl()}/public/schools`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load eligible schools (${response.status}).`);
  }

  return normalizeRegistrationEligibleSchoolsPayload(
    (await response.json()) as EligibleSchoolsPayload,
  );
}
