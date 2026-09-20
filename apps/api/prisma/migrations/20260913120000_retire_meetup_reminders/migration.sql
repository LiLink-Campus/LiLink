-- Keep historical messages while preventing retired meetup reminders from sending.
UPDATE "OutboundEmail"
SET "status" = 'EXHAUSTED',
    "nextAttemptAt" = NULL,
    "errorMessage" = 'Meetup workflow retired before delivery.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "dedupeKey" LIKE 'meetup-reminder:%'
  AND "status" IN ('PENDING', 'FAILED', 'PROCESSING');

-- Preserve old analytics records without retrying outcomes for retired workflows.
UPDATE "ProductEventOutbox"
SET "status" = 'EXHAUSTED',
    "nextAttemptAt" = NULL,
    "errorMessage" = 'Product workflow retired before recording.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE ("name" LIKE 'meetup\_%' ESCAPE '\' OR "name" = 'match_contact_requested')
  AND "status" IN ('PENDING', 'FAILED', 'PROCESSING');
