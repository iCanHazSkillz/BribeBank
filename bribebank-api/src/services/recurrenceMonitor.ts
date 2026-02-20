import { BountyStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  RecurrenceConfig,
  advanceSeriesWindow,
  computeNextOccurrenceAfter,
} from "../lib/recurrenceSchedule.js";
import { getEffectiveTimezone } from "../lib/timezone.js";
import { addHistoryEvent } from "./historyService.js";
import { addNotification } from "./notificationService.js";
import { broadcastToFamily } from "../realtime/eventBus.js";
import type { SseEvent } from "../types/sseEvents.js";

const CHECK_INTERVAL_MS = 60 * 1000;

type TaskLifecycleMetadata = {
  version: 1;
  lifecycleType: "TASK";
  bountyAssignmentId: string;
  bountyId?: string;
  rewardType?: "TICKETS" | "CUSTOM";
  rewardValue?: string;
  linkedAction?: string;
};

const buildTaskLifecycleMetadata = (
  data: Omit<TaskLifecycleMetadata, "version" | "lifecycleType">
) =>
  JSON.stringify({
    version: 1,
    lifecycleType: "TASK",
    ...data,
  } satisfies TaskLifecycleMetadata);

function buildRecurrenceConfig(series: {
  bounty: {
    recurrenceCadence: any;
    recurrencePattern: any;
    recurrenceDayOfWeek: number | null;
    recurrenceDayOfMonth: number | null;
    recurrenceWeekOfMonth: number | null;
    recurrenceMonthOfYear: number | null;
  };
}): RecurrenceConfig {
  return {
    cadence: series.bounty.recurrenceCadence,
    pattern: series.bounty.recurrencePattern,
    dayOfWeek: series.bounty.recurrenceDayOfWeek,
    dayOfMonth: series.bounty.recurrenceDayOfMonth,
    weekOfMonth: series.bounty.recurrenceWeekOfMonth,
    monthOfYear: series.bounty.recurrenceMonthOfYear,
  };
}

export async function processPausedAutoResumeSkips(now: Date): Promise<string[]> {
  const readyToResume = await prisma.bountyRecurrenceSeries.findMany({
    where: {
      active: true,
      pausedAt: { not: null },
      autoResumeSkipAt: { lte: now },
    },
    include: {
      family: {
        select: { timezone: true },
      },
      bounty: true,
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
        },
      },
    },
  });

  if (!readyToResume.length) {
    return [];
  }

  const resumedFamilyIds: string[] = [];

  for (const series of readyToResume) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const fresh = await tx.bountyRecurrenceSeries.findUnique({
          where: { id: series.id },
          include: {
            family: { select: { timezone: true } },
            bounty: true,
            user: {
              select: {
                id: true,
                displayName: true,
                username: true,
              },
            },
          },
        });

        if (!fresh || !fresh.active || !fresh.pausedAt || !fresh.autoResumeSkipAt) {
          return null;
        }

        if (!fresh.bounty.recurrenceEnabled || !fresh.bounty.recurrenceCadence) {
          await tx.bountyRecurrenceSeries.update({
            where: { id: fresh.id },
            data: {
              active: false,
              pausedAt: null,
              autoResumeSkipAt: null,
            },
          });
          return null;
        }

        const timezone = getEffectiveTimezone(fresh.family.timezone);
        const config = buildRecurrenceConfig(fresh);
        const resumedNextOccurrenceAt = computeNextOccurrenceAfter(
          fresh.autoResumeSkipAt,
          timezone,
          config
        );

        await tx.bountyRecurrenceSeries.update({
          where: { id: fresh.id },
          data: {
            pausedAt: null,
            autoResumeSkipAt: null,
            nextOccurrenceAt: resumedNextOccurrenceAt,
          },
        });

        const childName = fresh.user.displayName || fresh.user.username || "Child";

        if (fresh.currentAssignmentId) {
          await addHistoryEvent(
            {
              familyId: fresh.familyId,
              userId: fresh.userId,
              userName: childName,
              title: fresh.bounty.title || "Task",
              emoji: fresh.bounty.emoji || "🧹",
              action: "TASK_RECURRING_RESUMED",
              assignerName: "System",
              metadata: buildTaskLifecycleMetadata({
                bountyAssignmentId: fresh.currentAssignmentId,
                bountyId: fresh.bountyId,
                linkedAction: "TASK_RECURRING_RESUMED",
              }),
            },
            tx
          );
        }

        await addNotification(
          {
            userId: fresh.userId,
            message: `Recurring task resumed after skipping one occurrence: ${fresh.bounty.title}`,
          },
          tx
        );

        return { familyId: fresh.familyId };
      });

      if (result) {
        resumedFamilyIds.push(result.familyId);
      }
    } catch (error) {
      console.error("[recurrenceMonitor] auto-resume processing failed", series.id, error);
    }
  }

  return resumedFamilyIds;
}

export async function checkRecurringSeries(): Promise<void> {
  const now = new Date();
  const autoResumedFamilies = await processPausedAutoResumeSkips(now);

  if (autoResumedFamilies.length) {
    const familyIds = new Set(autoResumedFamilies);
    for (const familyId of familyIds) {
      const event: SseEvent = {
        type: "WALLET_UPDATE",
        familyId,
        reason: "TASK_RECURRING_RESUMED",
        timestamp: Date.now(),
      };
      broadcastToFamily(familyId, event);
    }
  }

  const dueSeries = await prisma.bountyRecurrenceSeries.findMany({
    where: {
      active: true,
      pausedAt: null,
      nextOccurrenceAt: { lte: now },
    },
    include: {
      family: {
        select: { timezone: true },
      },
      bounty: true,
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
        },
      },
    },
  });

  if (!dueSeries.length) {
    return;
  }

  for (const series of dueSeries) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const fresh = await tx.bountyRecurrenceSeries.findUnique({
          where: { id: series.id },
          include: {
            family: { select: { timezone: true } },
            bounty: true,
            user: {
              select: {
                id: true,
                displayName: true,
                username: true,
              },
            },
            currentAssignment: true,
          },
        });

        if (!fresh || !fresh.active || fresh.pausedAt) {
          return null;
        }

        if (!fresh.bounty.recurrenceEnabled || !fresh.bounty.recurrenceCadence) {
          await tx.bountyRecurrenceSeries.update({
            where: { id: fresh.id },
            data: { active: false },
          });
          return null;
        }

        const timezone = getEffectiveTimezone(fresh.family.timezone);
        const config = buildRecurrenceConfig(fresh);
        const window = advanceSeriesWindow(fresh.nextOccurrenceAt, now, timezone, config);

        const childName = fresh.user.displayName || fresh.user.username || "Child";
        const taskTitle = fresh.bounty.title || "Task";
        const taskEmoji = fresh.bounty.emoji || "🧹";

        let currentStreak = fresh.currentStreak;
        let streakGeneration = fresh.streakGeneration;

        const currentAssignment = fresh.currentAssignmentId
          ? fresh.currentAssignment
          : null;

        if (currentAssignment) {
          const completed =
            currentAssignment.status === BountyStatus.COMPLETED ||
            currentAssignment.status === BountyStatus.VERIFIED;

          if (completed) {
            currentStreak += 1;
            await tx.bountyAssignment.update({
              where: { id: currentAssignment.id },
              data: {
                streakCountAtClose: currentStreak,
                streakGenerationAtClose: streakGeneration,
              },
            });
          } else {
            currentStreak = 0;
            streakGeneration += 1;

            await tx.bountyAssignment.delete({
              where: { id: currentAssignment.id },
            });

            await addHistoryEvent(
              {
                familyId: fresh.familyId,
                userId: fresh.userId,
                userName: childName,
                title: taskTitle,
                emoji: taskEmoji,
                action: "TASK_EXPIRED_RECURRING",
                assignerName: "System",
                metadata: buildTaskLifecycleMetadata({
                  bountyAssignmentId: currentAssignment.id,
                  bountyId: fresh.bountyId,
                  rewardType:
                    fresh.bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
                  rewardValue: fresh.bounty.rewardValue,
                  linkedAction: "TASK_EXPIRED_RECURRING",
                }),
              },
              tx
            );
          }
        }

        const createdAssignment = await tx.bountyAssignment.create({
          data: {
            familyId: fresh.familyId,
            bountyId: fresh.bountyId,
            userId: fresh.userId,
            assignedBy: fresh.assignedBy,
            status: BountyStatus.OFFERED,
            recurrenceSeriesId: fresh.id,
            occurrenceStartAt: window.latestDueAt,
          },
        });

        await tx.bountyRecurrenceSeries.update({
          where: { id: fresh.id },
          data: {
            currentAssignmentId: createdAssignment.id,
            currentStreak,
            streakGeneration,
            nextOccurrenceAt: window.nextOccurrenceAt,
          },
        });

        await addHistoryEvent(
          {
            familyId: fresh.familyId,
            userId: fresh.userId,
            userName: childName,
            title: taskTitle,
            emoji: taskEmoji,
            action: "TASK_ASSIGNED",
            assignerName: "System",
            metadata: buildTaskLifecycleMetadata({
              bountyAssignmentId: createdAssignment.id,
              bountyId: fresh.bountyId,
              rewardType:
                fresh.bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
              rewardValue: fresh.bounty.rewardValue,
              linkedAction: "TASK_ASSIGNED",
            }),
          },
          tx
        );

        await addNotification(
          {
            userId: fresh.userId,
            message: `New recurring task available: ${taskTitle}`,
          },
          tx
        );

        return {
          familyId: fresh.familyId,
        };
      });

      if (result) {
        const event: SseEvent = {
          type: "WALLET_UPDATE",
          familyId: result.familyId,
          reason: "TASK_ASSIGNED",
          timestamp: Date.now(),
        };
        broadcastToFamily(result.familyId, event);
      }
    } catch (error) {
      console.error("[recurrenceMonitor] series processing failed", series.id, error);
    }
  }
}

export function startRecurrenceMonitoring(): void {
  console.log("[recurrenceMonitor] Starting recurrence monitoring service");
  void checkRecurringSeries();
  setInterval(() => {
    void checkRecurringSeries();
  }, CHECK_INTERVAL_MS);
}

export function computeInitialNextOccurrence(
  timezone: string,
  config: RecurrenceConfig,
  now: Date = new Date()
): Date {
  return computeNextOccurrenceAfter(now, timezone, config);
}
