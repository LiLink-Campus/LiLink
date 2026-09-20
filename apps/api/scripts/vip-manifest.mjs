import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [input, output, batch] = process.argv.slice(2);
if (!input || !output || !/^[a-zA-Z0-9_-]{1,100}$/.test(batch || '')) {
  throw new Error('Usage: node scripts/vip-manifest.mjs cards.txt manifest.json batch-name');
}
const codes = readFileSync(input, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim().replace(/[\s-]/g, '').toUpperCase()).filter(Boolean);
if (!codes.length || codes.length > 1000 || codes.some(code => !/^[A-Z0-9]{24}$/.test(code)) || new Set(codes).size !== codes.length) {
  throw new Error('Expected 1-1000 unique 24-character codes, one per line. No file was written.');
}
const hashes = codes.map(code => createHash('sha256').update(code).digest('hex'));
writeFileSync(output, JSON.stringify({ plan: 'VIP_30_DAYS', batch, hashes }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ count: hashes.length, batch, output }));
