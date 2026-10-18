// A missing school is explicit in matching answers, never a real School row.
export const NO_SCHOOL_ID = "__no_school__";

export type EducationStatus = {
  verified: boolean;
  verifiedAt: string | null;
  method: "SCHOOL_EMAIL" | "INVITE" | "LEGACY" | null;
  schoolId: string | null;
  schoolName: string | null;
};

export const UNVERIFIED_EDUCATION_NOTICE =
  "这个人尚未通过教育认证，可能非学生，请谨慎对待。";

export function educationIdentityLabel(verified: boolean) {
  return verified ? "教育用户" : "非教育用户";
}
