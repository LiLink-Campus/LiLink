-- Distinguish transactional mail (OTP, intros) from bulk mail (reminders, newsletters)
-- so From address, List-Unsubscribe, and headers can differ per category.
CREATE TYPE "OutboundEmailMessageCategory" AS ENUM ('TRANSACTIONAL', 'BULK');

ALTER TABLE "OutboundEmail"
ADD COLUMN "messageCategory" "OutboundEmailMessageCategory" NOT NULL DEFAULT 'TRANSACTIONAL';
