export function expandSchoolEmailDomains(domains: readonly string[]): string[] {
  return [...new Set(domains.flatMap((domain) =>
    domain.endsWith(".edu.cn") && domain !== "edu.cn"
      ? [domain, domain.replace(/\.edu\.cn$/, ".cn")]
      : [domain],
  ))];
}

export function normalizeSchoolEmailDomains(domains: readonly string[]): string[] {
  const unique = [...new Set(domains.map(domain => domain.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
  return unique.filter(domain => !unique.some(parent => parent !== domain && domain.endsWith(`.${parent}`)));
}
