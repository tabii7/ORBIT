import { DateTime } from 'luxon';
import { ReminderRecurrence } from '@prisma/client';

const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const TIME_AMPM_RE =
  /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)$/i;

/** Normalize "3pm", "3:00 PM", "15:00" → "HH:mm" (24h). */
export function normalizeTimeOfDay(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/\./g, '');
  const ampm = value.match(TIME_AMPM_RE);
  if (ampm) {
    let hh = Number(ampm[1]);
    const mm = Number(ampm[2] ?? '0');
    const meridiem = ampm[3].replace(/\./g, '');
    if (meridiem.startsWith('p') && hh < 12) hh += 12;
    if (meridiem.startsWith('a') && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  const plain = value.match(TIME_RE);
  if (plain) {
    const hh = Number(plain[1]);
    const mm = Number(plain[2]);
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  return null;
}

export function normalizeTimesOfDay(times?: string[]): string[] {
  if (!times?.length) return [];
  const out: string[] = [];
  for (const t of times) {
    const n = normalizeTimeOfDay(t);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function resolveRemindAt(params: {
  remindAtIso?: string;
  timesOfDay?: string[];
  /** Relative delay from now, e.g. "after 1 minute" → 1 */
  inMinutes?: number;
  timezone: string;
  from?: Date;
}): Date {
  const zone = params.timezone || 'Asia/Dubai';
  const from = params.from ? DateTime.fromJSDate(params.from) : DateTime.now();

  // Relative delays always win (e.g. "in 1 minute", "after 10 minutes")
  if (
    typeof params.inMinutes === 'number' &&
    Number.isFinite(params.inMinutes) &&
    params.inMinutes >= 0
  ) {
    return from
      .setZone(zone)
      .plus({ minutes: Math.floor(params.inMinutes) })
      .toUTC()
      .toJSDate();
  }

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

  const normalized = normalizeTimesOfDay(params.timesOfDay);
  const firstTime = normalized[0];
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

  const times = normalizeTimesOfDay(params.timesOfDay).filter((t) =>
    TIME_RE.test(t),
  );
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
