function isPrismaErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

export const isUniqueConstraintError = (error: unknown): boolean =>
  isPrismaErrorWithCode(error, 'P2002');

export const isRecordNotFoundError = (error: unknown): boolean =>
  isPrismaErrorWithCode(error, 'P2025');
