/**
 * Promotion campaign lifecycle.
 *
 * Soft-delete only: campaigns move DRAFT -> ACTIVE -> ENDED and are never hard
 * deleted (they are referenced by frozen user attribution, coupon templates,
 * and activations under onDelete: Restrict). At most one ACTIVE && isDefault
 * campaign exists, enforced by a partial unique index in the migration.
 */

export const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "ENDED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
