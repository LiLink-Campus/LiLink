import { readFileSync } from 'node:fs';
import { loadPrismaClientModule } from './prisma-client.mjs';

// Only SHA-256 digests enter this CLI. Plaintext codes stay in the sales platform.
const [command, file, confirmation] = process.argv.slice(2);
if (!['import', 'revoke'].includes(command) || !file) {
  throw new Error('Usage: node scripts/vip-codes.mjs import|revoke manifest.json [--apply]');
}
const manifest = JSON.parse(readFileSync(file, 'utf8'));
if (manifest.plan !== 'VIP_30_DAYS' || !/^[a-zA-Z0-9_-]{1,100}$/.test(manifest.batch)
  || !Array.isArray(manifest.hashes) || manifest.hashes.length < 1 || manifest.hashes.length > 1000
  || manifest.hashes.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))
  || new Set(manifest.hashes).size !== manifest.hashes.length) {
  throw new Error('Invalid manifest. Expected unique SHA-256 hashes, batch and VIP_30_DAYS plan.');
}
const destination = new URL(process.env.DATABASE_URL || '');
console.log(JSON.stringify({ command, count: manifest.hashes.length, batch: manifest.batch, host: destination.hostname, database: destination.pathname, apply: confirmation === '--apply' }));
if (confirmation !== '--apply') process.exit(0);
const { createPrismaClient } = await loadPrismaClientModule(['dist/src/modules/vip/vip-revocation.js']);
const { revokeVipCodes } = await import('../dist/src/modules/vip/vip-revocation.js');
const prisma = createPrismaClient();
if (!prisma.vipActivation) throw new Error('Rebuild the API before managing VIP codes.');
try {
  if (command === 'import') {
    const result = await prisma.vipActivation.createMany({ data: manifest.hashes.map(codeHash => ({ codeHash, batch: manifest.batch })), skipDuplicates: true });
    console.log(JSON.stringify({ imported: result.count, unchanged: manifest.hashes.length - result.count }));
  } else {
    const result = await revokeVipCodes(prisma, manifest);
    console.log(JSON.stringify({ revoked: result.count }));
  }
} finally { await prisma.$disconnect(); }
