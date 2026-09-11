import { DateTime } from 'luxon';
import {
  advanceRemindAt,
  resolveRemindAt,
} from './remind-at';
import { ReminderRecurrence } from '@prisma/client';

describe('remind-at helpers', () => {
  it('resolves times_of_day in timezone', () => {
    const from = DateTime.fromISO('2026-09-11T10:00:00', {
      zone: 'Asia/Dubai',
    }).toJSDate();
    const result = resolveRemindAt({
      timesOfDay: ['08:00'],
      timezone: 'Asia/Dubai',
      from,
    });
    const inZone = DateTime.fromJSDate(result).setZone('Asia/Dubai');
    expect(inZone.hour).toBe(8);
    expect(inZone.minute).toBe(0);
    expect(inZone.day).toBe(12);
  });

  it('advances daily to next timeslot', () => {
    const current = DateTime.fromISO('2026-09-11T08:00:00', {
      zone: 'Asia/Dubai',
    }).toJSDate();
    const next = advanceRemindAt({
      currentRemindAt: current,
      recurrence: ReminderRecurrence.DAILY,
      timesOfDay: ['08:00', '20:00'],
      timezone: 'Asia/Dubai',
    });
    expect(next).not.toBeNull();
    const inZone = DateTime.fromJSDate(next!).setZone('Asia/Dubai');
    expect(inZone.hour).toBe(20);
  });

  it('returns null for ONCE recurrence', () => {
    const next = advanceRemindAt({
      currentRemindAt: new Date(),
      recurrence: ReminderRecurrence.ONCE,
      timezone: 'Asia/Dubai',
    });
    expect(next).toBeNull();
  });
});
