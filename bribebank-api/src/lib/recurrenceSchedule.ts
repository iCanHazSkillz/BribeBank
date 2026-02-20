import { RecurrenceCadence, RecurrencePattern } from "@prisma/client";
import {
  addDaysToYmd,
  addMonthsToYm,
  clampDayOfMonth,
  getZonedDateParts,
  weekdayFromYmd,
  zonedTimeToUtc,
} from "./timezone.js";

export type RecurrenceConfig = {
  cadence: RecurrenceCadence;
  pattern?: RecurrencePattern | null;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  weekOfMonth?: number | null;
  monthOfYear?: number | null;
};

function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  weekOfMonth: number
): number {
  if (weekOfMonth === 5) {
    // 5 means "last weekday of month"
    let day = clampDayOfMonth(year, month, 31);
    while (weekdayFromYmd(year, month, day) !== weekday) {
      day -= 1;
    }
    return day;
  }

  const firstWeekday = weekdayFromYmd(year, month, 1);
  const offset = (weekday - firstWeekday + 7) % 7;
  let day = 1 + offset + (weekOfMonth - 1) * 7;
  const maxDay = clampDayOfMonth(year, month, 31);
  while (day > maxDay) {
    day -= 7;
  }
  return day;
}

function getCandidateAtLocalMidnight(
  timezone: string,
  year: number,
  month: number,
  day: number
): Date {
  return zonedTimeToUtc(timezone, year, month, day, 0, 0, 0);
}

function validateConfig(config: RecurrenceConfig): void {
  if (config.cadence === RecurrenceCadence.WEEKLY) {
    if (config.dayOfWeek === null || config.dayOfWeek === undefined) {
      throw new Error("WEEKLY_REQUIRES_DAY_OF_WEEK");
    }
  }

  if (config.cadence === RecurrenceCadence.MONTHLY) {
    if (!config.pattern) {
      throw new Error("MONTHLY_REQUIRES_PATTERN");
    }
    if (config.pattern === RecurrencePattern.DAY_OF_MONTH) {
      if (!config.dayOfMonth) {
        throw new Error("MONTHLY_DAY_OF_MONTH_REQUIRES_DAY");
      }
    } else if (config.pattern === RecurrencePattern.DAY_OF_WEEK) {
      if (
        config.dayOfWeek === null ||
        config.dayOfWeek === undefined ||
        !config.weekOfMonth
      ) {
        throw new Error("MONTHLY_DAY_OF_WEEK_REQUIRES_WEEK_AND_WEEKDAY");
      }
    }
  }

  if (config.cadence === RecurrenceCadence.YEARLY) {
    if (!config.pattern || !config.monthOfYear) {
      throw new Error("YEARLY_REQUIRES_PATTERN_AND_MONTH");
    }
    if (config.pattern === RecurrencePattern.DAY_OF_MONTH) {
      if (!config.dayOfMonth) {
        throw new Error("YEARLY_DAY_OF_MONTH_REQUIRES_DAY");
      }
    } else if (config.pattern === RecurrencePattern.DAY_OF_WEEK) {
      if (
        config.dayOfWeek === null ||
        config.dayOfWeek === undefined ||
        !config.weekOfMonth
      ) {
        throw new Error("YEARLY_DAY_OF_WEEK_REQUIRES_WEEK_AND_WEEKDAY");
      }
    }
  }
}

export function computeNextOccurrenceAfter(
  afterDate: Date,
  timezone: string,
  config: RecurrenceConfig
): Date {
  validateConfig(config);

  const local = getZonedDateParts(afterDate, timezone);

  if (config.cadence === RecurrenceCadence.DAILY) {
    const nextLocal = addDaysToYmd(local.year, local.month, local.day, 1);
    return getCandidateAtLocalMidnight(
      timezone,
      nextLocal.year,
      nextLocal.month,
      nextLocal.day
    );
  }

  if (config.cadence === RecurrenceCadence.WEEKLY) {
    const targetWeekday = Number(config.dayOfWeek);
    for (let delta = 0; delta <= 14; delta += 1) {
      const candidateLocal = addDaysToYmd(local.year, local.month, local.day, delta);
      if (
        weekdayFromYmd(candidateLocal.year, candidateLocal.month, candidateLocal.day) !==
        targetWeekday
      ) {
        continue;
      }

      const candidate = getCandidateAtLocalMidnight(
        timezone,
        candidateLocal.year,
        candidateLocal.month,
        candidateLocal.day
      );

      if (candidate.getTime() > afterDate.getTime()) {
        return candidate;
      }
    }
  }

  if (config.cadence === RecurrenceCadence.MONTHLY) {
    for (let monthDelta = 0; monthDelta <= 36; monthDelta += 1) {
      const ym = addMonthsToYm(local.year, local.month, monthDelta);
      let day = 1;

      if (config.pattern === RecurrencePattern.DAY_OF_MONTH) {
        day = clampDayOfMonth(ym.year, ym.month, Number(config.dayOfMonth));
      } else {
        day = getNthWeekdayOfMonth(
          ym.year,
          ym.month,
          Number(config.dayOfWeek),
          Number(config.weekOfMonth)
        );
      }

      const candidate = getCandidateAtLocalMidnight(timezone, ym.year, ym.month, day);
      if (candidate.getTime() > afterDate.getTime()) {
        return candidate;
      }
    }
  }

  if (config.cadence === RecurrenceCadence.YEARLY) {
    for (let yearDelta = 0; yearDelta <= 10; yearDelta += 1) {
      const year = local.year + yearDelta;
      const month = Number(config.monthOfYear);
      let day = 1;

      if (config.pattern === RecurrencePattern.DAY_OF_MONTH) {
        day = clampDayOfMonth(year, month, Number(config.dayOfMonth));
      } else {
        day = getNthWeekdayOfMonth(
          year,
          month,
          Number(config.dayOfWeek),
          Number(config.weekOfMonth)
        );
      }

      const candidate = getCandidateAtLocalMidnight(timezone, year, month, day);
      if (candidate.getTime() > afterDate.getTime()) {
        return candidate;
      }
    }
  }

  throw new Error("FAILED_TO_COMPUTE_NEXT_OCCURRENCE");
}

export function advanceSeriesWindow(
  nextOccurrenceAt: Date,
  now: Date,
  timezone: string,
  config: RecurrenceConfig
): { latestDueAt: Date; nextOccurrenceAt: Date } {
  let latestDueAt = nextOccurrenceAt;
  let nextAt = computeNextOccurrenceAfter(latestDueAt, timezone, config);

  while (nextAt.getTime() <= now.getTime()) {
    latestDueAt = nextAt;
    nextAt = computeNextOccurrenceAfter(latestDueAt, timezone, config);
  }

  return { latestDueAt, nextOccurrenceAt: nextAt };
}

