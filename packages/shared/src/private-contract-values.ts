export type JsonObject = Record<string, unknown>;
export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export const isString = (value: unknown): value is string => typeof value === "string";
export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
export const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
export const isCount = (value: unknown): value is number =>
  isNumber(value) && Number.isSafeInteger(value) && value >= 0;
export const isDate = (value: unknown): value is string =>
  isString(value) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
export const nullable = (value: unknown, check: (value: unknown) => boolean) =>
  value === null || check(value);
export const arrayOf = (value: unknown, check: (value: unknown) => boolean) =>
  Array.isArray(value) && value.every(check);
export const oneOf = (value: unknown, values: readonly string[]) =>
  isString(value) && values.includes(value);
export const fields = (
  value: JsonObject,
  keys: readonly string[],
  check: (value: unknown) => boolean
) => keys.every((key) => check(value[key]));
