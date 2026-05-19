const CHINA_STANDARD_TIME_OFFSET_MINUTES = 8 * 60;
const MINUTE_MS = 60_000;

export const CHINA_STANDARD_TIME_ZONE = "Asia/Shanghai";

const DATETIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function chinaStandardTimeParts(date: Date) {
  const shifted = new Date(
    date.getTime() + CHINA_STANDARD_TIME_OFFSET_MINUTES * MINUTE_MS,
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function toDatetimeLocalValue(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(
    parts.hour,
  )}:${pad(parts.minute)}`;
}

/** Map an instant to a `datetime-local` value interpreted as China Standard Time. */
export function chinaStandardDatetimeLocalValue(date: Date) {
  return toDatetimeLocalValue(chinaStandardTimeParts(date));
}

export function chinaStandardDatetimeLocalValueFromIso(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return chinaStandardDatetimeLocalValue(parsed);
}

/** Parse a `datetime-local` value as China Standard Time and return an ISO instant. */
export function chinaStandardDatetimeToIso(value: string) {
  const match = DATETIME_LOCAL_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const second = rawSecond ? Number(rawSecond) : 0;

  if (
    month < 1 ||
    month > 12 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second) -
    CHINA_STANDARD_TIME_OFFSET_MINUTES * MINUTE_MS;
  const roundTrip = chinaStandardTimeParts(new Date(utcMs));
  if (
    roundTrip.year !== year ||
    roundTrip.month !== month ||
    roundTrip.day !== day ||
    roundTrip.hour !== hour ||
    roundTrip.minute !== minute ||
    roundTrip.second !== second
  ) {
    return null;
  }

  return new Date(utcMs).toISOString();
}

export function formatChinaStandardDateTime(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "short",
    timeStyle: "short",
  },
) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    ...options,
    timeZone: CHINA_STANDARD_TIME_ZONE,
  }).format(parsed);
}

export function defaultChinaStandardDatetimeLocalValue(
  daysFromToday: number,
  hour: number,
  minute: number,
) {
  const today = chinaStandardTimeParts(new Date());
  const instant =
    Date.UTC(today.year, today.month - 1, today.day + daysFromToday, hour, minute) -
    CHINA_STANDARD_TIME_OFFSET_MINUTES * MINUTE_MS;
  return chinaStandardDatetimeLocalValue(new Date(instant));
}

export function minimumChinaStandardDatetimeLocalValue(minLeadMinutes: number) {
  return chinaStandardDatetimeLocalValue(
    new Date(Date.now() + minLeadMinutes * MINUTE_MS),
  );
}
