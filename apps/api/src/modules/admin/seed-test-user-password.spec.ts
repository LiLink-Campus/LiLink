import { generateSeedTestUserPassword } from './seed-test-user-password';

describe('generateSeedTestUserPassword', () => {
  it('returns distinct hex-based passwords across calls', () => {
    const first = generateSeedTestUserPassword();
    const second = generateSeedTestUserPassword();
    expect(first).not.toEqual(second);
  });

  it('matches login password constraints (length, letter, digit)', () => {
    const password = generateSeedTestUserPassword();
    expect(password.length).toBeGreaterThanOrEqual(8);
    expect(password.length).toBeLessThanOrEqual(128);
    expect(/[A-Za-z]/.test(password)).toBe(true);
    expect(/\d/.test(password)).toBe(true);
  });
});
