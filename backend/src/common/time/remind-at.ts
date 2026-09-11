import { DateTime } from 'luxon';
import { ReminderRecurrence } from '@prisma/client';

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

export function resolveRemindAt(params: {
  remindAtIso?: string;
  timesOfDay?: string[];
  timezone: string;
  from?: Date;
}): Date {
  const zone = params.timezone || 'Asia/Dubai';
  const from = params.from ? DateTime.fromJSDate(params.from) : DateTime.now();

  if (params.remindAtIso) {
    const parsed = DateTime.fromISO(params.remindAtIso, { zone });
    if (parsed.isValid) {
      return parsed.toUTC().toJSDate();
    }
    const asUtc = new Date(params.remindAtIso);
    if (!Number.isNaN(asUtc.getTime())) {
      return asUtc;
    }
  }

  const firstTime = params.timesOfDay?.find((t) => TIME_RE.test(t));
  if (firstTime) {
    const match = firstTime.match(TIME_RE)!;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    let candidate = from.setZone(zone).set({
      hour: hh,
      minute: mm,
      second: 0,
      millisecond: 0,
    });
    if (candidate <= from.setZone(zone)) {
      candidate = candidate.plus({ days: 1 });
    }
    return candidate.toUTC().toJSDate();
  }

  return from.toUTC().plus({ hours: 1 }).toJSDate();
}

export function advanceRemindAt(params: {
  currentRemindAt: Date;
  recurrence: ReminderRecurrence;
  timesOfDay?: string[];
  timezone: string;
}): Date | null {
  if (params.recurrence === ReminderRecurrence.ONCE) {
    return null;
  }

  const zone = params.timezone || 'Asia/Dubai';
  const current = DateTime.fromJSDate(params.currentRemindAt).setZone(zone);
  const days = params.recurrence === ReminderRecurrence.WEEKLY ? 7 : 1;

  const times = (params.timesOfDay ?? []).filter((t) => TIME_RE.test(t));
  if (times.length > 1) {
    const currentMinutes = current.hour * 60 + current.minute;
    const sorted = times
      .map((t) => {
        const [, hh, mm] = t.match(TIME_RE)!;
        return { t, minutes: Number(hh) * 60 + Number(mm) };
      })
      .sort((a, b) => a.minutes - b.minutes);

    const nextSameDay = sorted.find((x) => x.minutes > currentMinutes);
    if (nextSameDay) {
      return current
        .set({
          hour: Math.floor(nextSameDay.minutes / 60),
          minute: nextSameDay.minutes % 60,
          second: 0,
          millisecond: 0,
        })
        .toUTC()
        .toJSDate();
    }

    const first = sorted[0];
    return current
      .plus({ days })
      .set({
        hour: Math.floor(first.minutes / 60),
        minute: first.minutes % 60,
        second: 0,
        millisecond: 0,
      })
      .toUTC()
      .toJSDate();
  }

  return current.plus({ days }).toUTC().toJSDate();
}
