const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expandSchoolEmailDomains } = require('./dist');
test('adds cn aliases while preserving subdomains and deduplicating', () => {
  assert.deepEqual(expandSchoolEmailDomains(['muc.edu.cn', 'muc.cn', 'stu.blcu.edu.cn', 'qmul.ac.uk']), ['muc.edu.cn', 'muc.cn', 'stu.blcu.edu.cn', 'stu.blcu.cn', 'qmul.ac.uk']);
});
test('does not expand bare public suffixes', () => {
  assert.deepEqual(expandSchoolEmailDomains(['edu.cn', 'cn']), ['edu.cn', 'cn']);
});

test('normalizes duplicates and removes subdomains covered by a configured parent', () => {
  const { normalizeSchoolEmailDomains } = require('./dist');
  assert.deepEqual(normalizeSchoolEmailDomains(['@std.uestc.edu.cn', 'std.uestc.cn', 'uestc.edu.cn', ' UESTC.CN ', 'uestc.cn']), ['uestc.edu.cn', 'uestc.cn']);
  assert.deepEqual(normalizeSchoolEmailDomains(['eviluestc.cn', 'uestc.cn']), ['eviluestc.cn', 'uestc.cn']);
  assert.deepEqual(normalizeSchoolEmailDomains(['student.ubc.ca']), ['student.ubc.ca']);
});

test('directory covers supplied suffixes and has no redundant or ambiguous domains', () => {
  const { SCHOOL_DIRECTORY, normalizeSchoolEmailDomains } = require('./dist');
  const expected = ['coventry.ac.uk','cuc.cn','cuc.edu.cn','live.mdx.ac.uk','mdx.ac.uk','muc.cn','muc.edu.cn','bsu.cn','bsu.edu.cn','ualberta.ca','blcu.cn','blcu.edu.cn','bupt.cn','bupt.edu.cn','qmul.ac.uk','gla.ac.uk','glasgow.ac.uk','uestc.cn','uestc.edu.cn'];
  const domains = SCHOOL_DIRECTORY.flatMap(school => school.domains);
  assert.equal(new Set(domains).size, domains.length);
  for (const domain of expected) assert.ok(domains.some(parent => parent === domain || domain.endsWith(`.${parent}`)), domain);
  for (const school of SCHOOL_DIRECTORY) assert.deepEqual(normalizeSchoolEmailDomains(school.domains), school.domains);
});

test('cooperation partners register and aggregate under the Chinese school', () => {
  const { SCHOOL_DIRECTORY } = require('./dist');
  assert.equal(SCHOOL_DIRECTORY.length, 11);
  const cuc = SCHOOL_DIRECTORY.find(s => s.id === 'cuc');
  assert.equal(cuc.name, '中国传媒大学');
  for (const domain of ['cuc.edu.cn', 'cuc.cn', 'coventry.ac.uk', 'abertay.ac.uk']) assert.ok(cuc.domains.includes(domain));
  assert.ok(!SCHOOL_DIRECTORY.some(s => s.id === 'coventry' || s.id === 'abertay'));
});
