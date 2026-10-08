// Loaded only into the disposable API process by --background-evidence. Record
// timing and fixed categories, never SQL, parameters, URLs, or row contents.
const { appendFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
if (!process.env.E2E_RUN_ID || !process.env.E2E_OUTPUT) throw new Error('E2E observer requires the isolated runner.');
const requireApi = createRequire(path.resolve('apps/api/package.json'));
const { Client } = requireApi('pg');
const query = Client.prototype.query;
Client.prototype.query = function (...args) {
  const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? '';
  const category = sql.includes('PublicCacheInvalidation') ? 'cache'
    : sql.includes('OutboundEmail') ? 'mail' : sql.includes('MatchCycle') ? 'cycle' : 'other';
  appendFileSync(path.join(process.env.E2E_OUTPUT, 'application-sql.jsonl'), JSON.stringify({ at: Date.now(), category }) + '\n');
  return query.apply(this, args);
};
