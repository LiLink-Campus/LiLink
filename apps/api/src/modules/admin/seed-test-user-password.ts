import { randomBytes } from 'crypto';

const SEED_PASSWORD_RANDOM_BYTES = 18;

/**
 * Login-compatible password for admin-seeded demo accounts. A fresh value per
 * seed run prevents repository disclosure alone from authenticating as those
 * predictable emails.
 */
export function generateSeedTestUserPassword(): string {
  return `${randomBytes(SEED_PASSWORD_RANDOM_BYTES).toString('hex')}0a`;
}
