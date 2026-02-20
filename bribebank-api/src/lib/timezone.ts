const TZ_FALLBACK = "UTC";

export function getContainerTimezone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved || TZ_FALLBACK;
}

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getEffectiveTimezone(familyTimezone?: string | null): string {
  if (familyTimezone && isValidIanaTimezone(familyTimezone)) {
    return familyTimezone;
  }
  return getContainerTimezone();
}

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
    second: lookup("second"),
  };
}

export function zonedTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 6; i += 1) {
    const zoned = getZonedDateParts(new Date(guess), timezone);
    const deltaMs =
      Date.UTC(year, month - 1, day, hour, minute, second) -
      Date.UTC(
        zoned.year,
        zoned.month - 1,
        zoned.day,
        zoned.hour,
        zoned.minute,
        zoned.second
      );

    if (deltaMs === 0) {
      break;
    }

    guess += deltaMs;
  }

  return new Date(guess);
}

export function addDaysToYmd(
  year: number,
  month: number,
  day: number,
  deltaDays: number
): { year: number; month: number; day: number } {
  const next = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

export function addMonthsToYm(
  year: number,
  month: number,
  deltaMonths: number
): { year: number; month: number } {
  const monthIndex = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(monthIndex / 12);
  const nextMonth = (monthIndex % 12) + 1;
  return { year: nextYear, month: nextMonth };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampDayOfMonth(year: number, month: number, day: number): number {
  return Math.max(1, Math.min(day, daysInMonth(year, month)));
}

export function weekdayFromYmd(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

