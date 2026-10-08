// An isolated process boundary fixture, using the built production workers.
require('reflect-metadata');
const { createPublicCacheDatabase } = require('../dist/src/modules/public/public-cache-database');
const { PublicCacheInvalidationService } = require('../dist/src/modules/public/public-cache-invalidation.service');
const { PublicCachePublicationService } = require('../dist/src/modules/public/public-cache-publication.service');
const { PublicCacheSignals } = require('../dist/src/modules/public/public-cache-signals');
const { PublicService } = require('../dist/src/modules/public/public.service');
const { CommunityStatsService } = require('../dist/src/modules/public/community-stats.service');
const db = createPublicCacheDatabase();
const signals = new PublicCacheSignals();
const invalidation = new PublicCacheInvalidationService(db, signals);
new PublicService(db, invalidation);
new CommunityStatsService(db, invalidation);
const publication = new PublicCachePublicationService(db, invalidation, signals);
if (process.argv[2] === 'crash-after-ack') {
  signals.acknowledged = () => process.exit(0);
  invalidation.snapshotHash('home').then(hash => {
    process.send({ hash });
    invalidation.onApplicationBootstrap();
  }).catch(() => process.exit(1));
} else publication.onApplicationBootstrap();
process.once('SIGTERM', () => {
  invalidation.onModuleDestroy();
  publication.onModuleDestroy();
  db.$disconnect().finally(() => process.exit(0));
});
// IPC keeps the worker alive while its production timers are unref'ed.
process.on('message', () => {});
