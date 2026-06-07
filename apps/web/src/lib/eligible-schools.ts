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

export function extractEmailDomain(rawEmail: string): string | null {
  const normalized = rawEmail.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");

  if (atIndex === -1 || atIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(atIndex + 1);
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

// The registration-eligible school set is the single source of truth served by
// GET /public/schools (schools flagged registrationEligible in the admin school
// center). The web no longer hardcodes the partner list, so adding a school +
// domains in the backend makes its email range count as a school email
// automatically.
export async function fetchEligibleSchools(): Promise<EligibleSchoolsPayload> {
  const response = await fetch(`${getClientApiBaseUrl()}/public/schools`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load eligible schools (${response.status}).`);
  }

  return (await response.json()) as EligibleSchoolsPayload;
}
