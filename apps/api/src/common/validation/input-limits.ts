export const EMAIL_MAX_LENGTH = 254;

export const PROFILE_FULL_NAME_MAX_LENGTH = 80;
export const PROFILE_HEADLINE_MAX_LENGTH = 160;
export const PROFILE_BIO_MAX_LENGTH = 1_000;
export const PROFILE_SHORT_TEXT_MAX_LENGTH = 80;
export const PROFILE_ARRAY_MAX_ITEMS = 20;
export const PROFILE_ARRAY_ITEM_MAX_LENGTH = 80;

export const CONTACT_METHOD_VALUE_MAX_LENGTH = 120;

export const REPORT_DETAILS_MAX_LENGTH = 2_000;

export const MATCH_FEEDBACK_COMMENT_MAX_LENGTH = 1_000;

export const QUESTIONNAIRE_ACKNOWLEDGEMENT_KEYS_MAX_ITEMS = 100;
export const QUESTIONNAIRE_ACKNOWLEDGEMENT_KEY_MAX_LENGTH = 128;

export const ADMIN_LIST_PAGE_MAX = 100_000;
export const ADMIN_LIST_PAGE_SIZE_MAX = 50;
export const ADMIN_SEARCH_MAX_LENGTH = 120;
export const ADMIN_ID_MAX_LENGTH = 128;
export const ADMIN_DESCRIPTION_MAX_LENGTH = 1_000;
export const ADMIN_SCHOOL_NAME_MAX_LENGTH = 120;
export const ADMIN_SCHOOL_SLUG_MAX_LENGTH = 80;
export const ADMIN_SCHOOL_DOMAIN_MAX_ITEMS = 100;
export const ADMIN_SCHOOL_DOMAIN_MAX_LENGTH = 255;
export const ADMIN_CYCLE_CODENAME_MAX_LENGTH = 120;
export const ADMIN_CYCLE_NOTES_MAX_LENGTH = 2_000;
export const ADMIN_QUESTION_KEY_MAX_LENGTH = 80;
export const ADMIN_QUESTION_PROMPT_MAX_LENGTH = 500;
export const ADMIN_QUESTION_OPTION_VALUE_MAX_LENGTH = 120;
export const ADMIN_QUESTION_OPTION_LABEL_MAX_LENGTH = 200;
export const ADMIN_QUESTION_OPTIONS_MAX_ITEMS = 50;
export const ADMIN_QUESTION_REORDER_MAX_ITEMS = 100;
export const ADMIN_REPORT_BATCH_MAX_ITEMS = 100;
export const ADMIN_REPORT_REVIEW_NOTES_MAX_LENGTH = 2_000;
export const ADMIN_SETTINGS_VALUE_MAX_LENGTH = 12;

export const INVITE_CODE_OWNER_NAME_MAX_LENGTH = 100;
export const INVITE_CODE_MAX_INPUT_LENGTH = 64;

// Merchant promotion system (M2/M3 admin CRUD). Lengths mirror the contract DTOs.
export const MERCHANT_NAME_MAX_LENGTH = 80;
export const MERCHANT_CONTACT_MAX_LENGTH = 200;
export const CAMPAIGN_NAME_MAX_LENGTH = 80;
export const CAMPAIGN_SLUG_MAX_LENGTH = 64;
export const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 500;
export const COUPON_TEMPLATE_TITLE_MAX_LENGTH = 80;
export const COUPON_TEMPLATE_DESCRIPTION_MAX_LENGTH = 500;
// faceValue is a nominal amount in cents; cap at 1,000,000.00 (¥1M) to bound input.
export const COUPON_FACE_VALUE_MAX = 100_000_000;
export const COUPON_VALID_DAYS_MAX = 3_650;
export const MERCHANT_USER_PASSWORD_MIN = 8;
export const MERCHANT_USER_PASSWORD_MAX = 200;
export const MERCHANT_USER_DISPLAY_NAME_MAX = 80;
// Redemption short code: 8 (recruiter) / 10 (personal + coupon); accept a bit
// of slack for trimming/casing on input.
export const REDEEM_CODE_MAX_LENGTH = 16;
// Order amount entered at redemption (cents, §B). Bounded like faceValue.
export const REDEEM_ORDER_AMOUNT_MAX = COUPON_FACE_VALUE_MAX;
// Redeem ticket is a short-lived JWT bound to {couponId, merchantId}; bound the
// accepted length generously to reject oversized input without truncating valid
// tokens.
export const REDEEM_TICKET_MAX_LENGTH = 512;
