import { nextWeeklyReveal, weeklyNumber } from './weekly-cycle.service';

describe('weekly cycle calendar', () => {
  it.each([
    ['2026-09-23T06:00:00Z', 2, '2026-09-29T13:00:00.000Z'],
    ['2026-09-29T10:59:59Z', 2, '2026-09-29T13:00:00.000Z'],
    ['2026-09-29T11:00:00Z', 2, '2026-10-06T13:00:00.000Z'],
    ['2026-09-29T13:00:00Z', 2, '2026-10-06T13:00:00.000Z'],
    ['2026-12-31T18:00:00Z', 2, '2027-01-05T13:00:00.000Z'],
    ['2026-09-28T13:00:00Z', 24, '2026-10-06T13:00:00.000Z'],
    ['2026-09-29T11:30:00Z', 1, '2026-09-29T13:00:00.000Z'],
  ])('chooses a future registration window from %s', (now, hours, expected) => {
    expect(nextWeeklyReveal(new Date(now), hours).toISOString()).toBe(expected);
  });
  it.each([
    ['第11周', 11],
    ['第六周', 6],
    ['第十二周', 12],
    ['第 12 周', 12],
    ['验收专用轮次', 0],
  ])('reads %s numbering', (name, expected) => {
    expect(weeklyNumber(name)).toBe(expected);
  });
});
