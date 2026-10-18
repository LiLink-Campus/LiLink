import type { Prisma } from '../prisma/client';

type CatalogTransaction = Pick<Prisma.TransactionClient, '$executeRaw'>;
type SchoolStore = Pick<Prisma.TransactionClient, 'schoolDomain'>;

export async function lockSchoolCatalog(
  tx: CatalogTransaction,
  mode: 'read' | 'write',
) {
  // A separate two-int advisory namespace cannot collide with mailbox hashes.
  if (mode === 'write') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1279872587, 1)`;
  } else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(1279872587, 1)`;
  }
}

export async function resolveSchoolEmail(store: SchoolStore, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf('@');
  if (atIndex === -1) return null;
  return resolveSchoolDomain(store, normalizedEmail.slice(atIndex + 1));
}

export async function resolveSchoolDomain(
  store: SchoolStore,
  emailDomain: string,
) {
  const candidateDomains = emailDomain
    .split('.')
    .map((_, index, parts) => parts.slice(index).join('.'))
    // Bare top-level domains can never confer school identity.
    .filter((candidate) => candidate.includes('.'));
  const domains = await store.schoolDomain.findMany({
    where: { domain: { in: candidateDomains } },
    include: { school: true },
  });
  const match = domains
    .sort((left, right) => right.domain.length - left.domain.length)
    .find(
      (item) =>
        item.domain.includes('.') &&
        (emailDomain === item.domain ||
          emailDomain.endsWith(`.${item.domain}`)),
    );
  return match
    ? {
        schoolId: match.schoolId,
        matchedDomain: match.domain,
        schoolName: match.school.name,
        schoolSlug: match.school.slug,
        schoolDescription: match.school.description,
        registrationEligible: match.school.registrationEligible,
      }
    : null;
}
