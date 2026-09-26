import { BadRequestException } from '@nestjs/common';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
} from '../../common/validation/display-name';
export function hasDisplayNameChange(
  currentDisplayName: string | null | undefined,
  nextDisplayName: string,
) {
  if (!isValidDisplayName(nextDisplayName)) {
    return false;
  }

  return (currentDisplayName?.trim() ?? '') !== nextDisplayName;
}
export function isValidDisplayName(value: string) {
  return (
    value.length >= DISPLAY_NAME_MIN_LENGTH &&
    value.length <= DISPLAY_NAME_MAX_LENGTH
  );
}
export function assertValidDisplayName(value: string) {
  if (isValidDisplayName(value)) {
    return;
  }

  throw new BadRequestException(
    `Display name must be between ${DISPLAY_NAME_MIN_LENGTH} and ${DISPLAY_NAME_MAX_LENGTH} characters.`,
  );
}
export function normalizeProfileDisplayName(value: string) {
  const trimmedValue = value.trim();
  assertValidDisplayName(trimmedValue);
  return trimmedValue;
}
export function normalizeQuestionnaireDisplayName(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  assertValidDisplayName(trimmedValue);
  return trimmedValue;
}
export function resolveQuestionnaireSubmissionDisplayName(
  requestedDisplayName: string | undefined,
  currentDisplayName: string | null | undefined,
) {
  if (requestedDisplayName !== undefined && requestedDisplayName.length >= 2) {
    return requestedDisplayName;
  }

  return currentDisplayName?.trim() ?? '';
}
