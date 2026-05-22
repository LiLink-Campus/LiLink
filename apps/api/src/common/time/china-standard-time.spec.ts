import {
  parseChinaStandardDateTimeMatch,
  parseDateTimeAsChinaStandardOrInstant,
} from './china-standard-time';

describe('china-standard-time', () => {
  it('parses offset-less datetimes as China Standard Time', () => {
    const parsed = parseDateTimeAsChinaStandardOrInstant('2026-05-19T19:00');
    expect(parsed.toISOString()).toBe('2026-05-19T11:00:00.000Z');
  });

  it('keeps zoned ISO datetimes as instants', () => {
    const parsed = parseDateTimeAsChinaStandardOrInstant(
      '2026-05-19T11:00:00.000Z',
    );
    expect(parsed.toISOString()).toBe('2026-05-19T11:00:00.000Z');
  });

  it('rejects invalid offset-less datetimes', () => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(
      '2026-02-30T19:00',
    );
    expect(match).not.toBeNull();
    expect(parseChinaStandardDateTimeMatch(match!)).toBeNull();
  });
});
