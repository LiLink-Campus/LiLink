export const loadTargets = [
  { projectId: 'patient-meadow-65557384', branchId: 'br-muddy-poetry-azax6deb', directHost: 'ep-crimson-thunder-aztzdzla.c-3.ap-southeast-1.aws.neon.tech', database: 'neondb', role: 'release_load' },
  { projectId: 'dark-base-23448181', branchId: 'br-curly-feather-aoc2i9ik', directHost: 'ep-billowing-cake-ao0xvw07.c-2.ap-southeast-1.aws.neon.tech', database: 'lilink_load_20260921', role: 'release_mac_20260921' },
];

export function resolveLoadTarget(manifest) {
  const target = loadTargets.find(target => target.projectId === manifest.projectId && target.branchId === manifest.branchId && target.database === (manifest.database ?? 'neondb'));
  if (!target) throw new Error('Refusing an unverified synthetic load target.');
  return target;
}

export function resolveDatabaseTarget(connectionString) {
  const url = new URL(connectionString);
  const target = loadTargets.find(target => url.hostname === target.directHost && url.pathname === `/${target.database}` && url.username === target.role);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['', '5432'].includes(url.port) || !target) throw new Error('Refusing a database outside the verified synthetic load targets.');
  return target;
}
