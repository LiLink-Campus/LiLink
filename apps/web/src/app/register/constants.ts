export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 30;
export const VERIFICATION_CODE_LENGTH = 6;
export const REGISTER_REFERRAL_CODE_MAX_LENGTH = 64;
export const RESEND_COOLDOWN_SECONDS = 30;

type RegistrationMode = "SCHOOL_EMAIL" | "NON_EDU_REFERRAL_REQUIRED";

export type CodeResponse = {
  email: string;
  expiresAt: string;
  school?: {
    schoolName: string;
    matchedDomain: string;
  } | null;
  registrationMode?: RegistrationMode;
  devCode?: string;
};
