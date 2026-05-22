const CHINA_STANDARD_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

export const OFFSETLESS_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;

export function parseChinaStandardDateTimeMatch(
  match: RegExpExecArray,
): Date | null {
  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond, rawMs] =
    match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const second = rawSecond ? Number(rawSecond) : 0;
  const millisecond = rawMs ? Number(rawMs.slice(0, 3).padEnd(3, '0')) : 0;

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
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
    CHINA_STANDARD_TIME_OFFSET_MS;
  const roundTrip = new Date(utcMs + CHINA_STANDARD_TIME_OFFSET_MS);

  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() + 1 !== month ||
    roundTrip.getUTCDate() !== day ||
    roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute ||
    roundTrip.getUTCSeconds() !== second ||
    roundTrip.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  return new Date(utcMs);
}

/** Offset-less datetimes are China Standard Time; zoned ISO strings keep their instant. */
export function parseDateTimeAsChinaStandardOrInstant(value: string): Date {
  const offsetlessDateTime = OFFSETLESS_DATE_TIME_PATTERN.exec(value);
  if (offsetlessDateTime) {
    const parsed = parseChinaStandardDateTimeMatch(offsetlessDateTime);
    if (!parsed) {
      throw new Error('Invalid China Standard Time datetime.');
    }

    return parsed;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid datetime.');
  }

  return parsed;
}
