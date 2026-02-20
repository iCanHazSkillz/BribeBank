import { Request, Response } from "express";
import {
  BountyStatus,
  DenialReason,
  Prisma,
  PrizeStatus,
  PrizeType,
  RecurrenceCadence,
  RecurrencePattern,
  Role,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { assertFamilyMember, assertParent, getRequestUser } from "../lib/authHelpers.js";
import { broadcastToFamily } from "../realtime/eventBus.js";
import { sendPushToUser } from "../services/pushService.js";
import { SseEvent } from "../types/sseEvents";
import { addHistoryEvent } from "../services/historyService.js";
import { addNotification } from "../services/notificationService.js";
import { processTaskPhoto } from "../lib/imageProcessor.js";
import { computeInitialNextOccurrence } from "../services/recurrenceMonitor.js";
import { RecurrenceConfig } from "../lib/recurrenceSchedule.js";
import { getEffectiveTimezone } from "../lib/timezone.js";

type TaskLifecycleMetadata = {
  version: 1;
  lifecycleType: "TASK";
  bountyAssignmentId: string;
  bountyId?: string;
  rewardAssignmentId?: string;
  rewardType?: "TICKETS" | "CUSTOM";
  rewardValue?: string;
  linkedAction?: string;
  denialMessage?: string;
  allowResubmit?: boolean;
  cancelledByUserId?: string;
  cancelledByName?: string;
  fcfsClaimedByUserId?: string;
  fcfsClaimedByName?: string;
};

const buildTaskLifecycleMetadata = (
  data: Omit<TaskLifecycleMetadata, "version" | "lifecycleType">
) =>
  JSON.stringify({
    version: 1,
    lifecycleType: "TASK",
    ...data,
  } satisfies TaskLifecycleMetadata);

type StreakMilestoneInput = {
  threshold: number;
  rewardType: "TICKETS" | "CUSTOM";
  rewardValue: string;
};

type NormalizedRecurrenceInput = {
  recurrenceEnabled: boolean;
  recurrenceCadence: RecurrenceCadence | null;
  recurrencePattern: RecurrencePattern | null;
  recurrenceDayOfWeek: number | null;
  recurrenceDayOfMonth: number | null;
  recurrenceWeekOfMonth: number | null;
  recurrenceMonthOfYear: number | null;
  streakEnabled: boolean;
  streakMilestones: StreakMilestoneInput[];
};

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function asBooleanWithDefault(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return defaultValue;
}

function parseStreakMilestones(raw: unknown): StreakMilestoneInput[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const threshold = asNumberOrNull(item.threshold);
      const rewardType =
        item.rewardType === "TICKETS" || item.rewardType === "CUSTOM"
          ? item.rewardType
          : null;
      const rewardValue =
        typeof item.rewardValue === "string" ? item.rewardValue.trim() : "";

      if (!threshold || threshold < 1 || !rewardType || !rewardValue) {
        return null;
      }

      return {
        threshold: Math.floor(threshold),
        rewardType,
        rewardValue,
      } satisfies StreakMilestoneInput;
    })
    .filter((v): v is StreakMilestoneInput => !!v)
    .sort((a, b) => a.threshold - b.threshold);
}

function normalizeRecurrenceInput(payload: Record<string, unknown>): NormalizedRecurrenceInput {
  const recurrenceEnabled = !!payload.recurrenceEnabled;
  const recurrenceCadence =
    typeof payload.recurrenceCadence === "string" &&
    Object.values(RecurrenceCadence).includes(payload.recurrenceCadence as RecurrenceCadence)
      ? (payload.recurrenceCadence as RecurrenceCadence)
      : null;
  const recurrencePattern =
    typeof payload.recurrencePattern === "string" &&
    Object.values(RecurrencePattern).includes(payload.recurrencePattern as RecurrencePattern)
      ? (payload.recurrencePattern as RecurrencePattern)
      : null;

  const recurrenceDayOfWeek = asNumberOrNull(payload.recurrenceDayOfWeek);
  const recurrenceDayOfMonth = asNumberOrNull(payload.recurrenceDayOfMonth);
  const recurrenceWeekOfMonth = asNumberOrNull(payload.recurrenceWeekOfMonth);
  const recurrenceMonthOfYear = asNumberOrNull(payload.recurrenceMonthOfYear);
  const streakEnabled = !!payload.streakEnabled;
  const streakMilestones = parseStreakMilestones(payload.streakMilestones);

  return {
    recurrenceEnabled,
    recurrenceCadence,
    recurrencePattern,
    recurrenceDayOfWeek,
    recurrenceDayOfMonth,
    recurrenceWeekOfMonth,
    recurrenceMonthOfYear,
    streakEnabled,
    streakMilestones,
  };
}

function validateRecurrenceInput(input: NormalizedRecurrenceInput, isFCFS: boolean): string | null {
  if (!input.recurrenceEnabled) {
    return null;
  }

  if (isFCFS) {
    return "RECURRING_NOT_ALLOWED_WITH_FCFS";
  }

  if (!input.recurrenceCadence) {
    return "RECURRENCE_CADENCE_REQUIRED";
  }

  if (input.recurrenceCadence === RecurrenceCadence.WEEKLY) {
    if (
      input.recurrenceDayOfWeek === null ||
      input.recurrenceDayOfWeek < 0 ||
      input.recurrenceDayOfWeek > 6
    ) {
      return "WEEKLY_REQUIRES_DAY_OF_WEEK";
    }
  }

  if (input.recurrenceCadence === RecurrenceCadence.MONTHLY) {
    if (!input.recurrencePattern) {
      return "MONTHLY_REQUIRES_PATTERN";
    }
    if (input.recurrencePattern === RecurrencePattern.DAY_OF_MONTH) {
      if (
        input.recurrenceDayOfMonth === null ||
        input.recurrenceDayOfMonth < 1 ||
        input.recurrenceDayOfMonth > 31
      ) {
        return "MONTHLY_DAY_OF_MONTH_REQUIRES_VALID_DAY";
      }
    } else {
      if (
        input.recurrenceWeekOfMonth === null ||
        input.recurrenceWeekOfMonth < 1 ||
        input.recurrenceWeekOfMonth > 5 ||
        input.recurrenceDayOfWeek === null ||
        input.recurrenceDayOfWeek < 0 ||
        input.recurrenceDayOfWeek > 6
      ) {
        return "MONTHLY_DAY_OF_WEEK_REQUIRES_WEEK_AND_WEEKDAY";
      }
    }
  }

  if (input.recurrenceCadence === RecurrenceCadence.YEARLY) {
    if (!input.recurrencePattern) {
      return "YEARLY_REQUIRES_PATTERN";
    }
    if (
      input.recurrenceMonthOfYear === null ||
      input.recurrenceMonthOfYear < 1 ||
      input.recurrenceMonthOfYear > 12
    ) {
      return "YEARLY_REQUIRES_MONTH";
    }
    if (input.recurrencePattern === RecurrencePattern.DAY_OF_MONTH) {
      if (
        input.recurrenceDayOfMonth === null ||
        input.recurrenceDayOfMonth < 1 ||
        input.recurrenceDayOfMonth > 31
      ) {
        return "YEARLY_DAY_OF_MONTH_REQUIRES_VALID_DAY";
      }
    } else {
      if (
        input.recurrenceWeekOfMonth === null ||
        input.recurrenceWeekOfMonth < 1 ||
        input.recurrenceWeekOfMonth > 5 ||
        input.recurrenceDayOfWeek === null ||
        input.recurrenceDayOfWeek < 0 ||
        input.recurrenceDayOfWeek > 6
      ) {
        return "YEARLY_DAY_OF_WEEK_REQUIRES_WEEK_AND_WEEKDAY";
      }
    }
  }

  if (input.streakEnabled && !input.recurrenceEnabled) {
    return "STREAK_REQUIRES_RECURRING";
  }

  if (input.streakEnabled) {
    const seen = new Set<number>();
    for (const milestone of input.streakMilestones) {
      if (seen.has(milestone.threshold)) {
        return "DUPLICATE_STREAK_THRESHOLD";
      }
      seen.add(milestone.threshold);
    }
  }

  return null;
}

function bountyRecurrenceConfig(bounty: {
  recurrenceCadence: RecurrenceCadence | null;
  recurrencePattern: RecurrencePattern | null;
  recurrenceDayOfWeek: number | null;
  recurrenceDayOfMonth: number | null;
  recurrenceWeekOfMonth: number | null;
  recurrenceMonthOfYear: number | null;
}): RecurrenceConfig {
  if (!bounty.recurrenceCadence) {
    throw new Error("BOUNTY_RECURRENCE_NOT_CONFIGURED");
  }
  return {
    cadence: bounty.recurrenceCadence,
    pattern: bounty.recurrencePattern,
    dayOfWeek: bounty.recurrenceDayOfWeek,
    dayOfMonth: bounty.recurrenceDayOfMonth,
    weekOfMonth: bounty.recurrenceWeekOfMonth,
    monthOfYear: bounty.recurrenceMonthOfYear,
  };
}

async function createRecurringAssignment(
  tx: Prisma.TransactionClient,
  params: {
    familyId: string;
    bountyId: string;
    userId: string;
    assignedBy: string;
    seriesId: string;
    occurrenceStartAt: Date;
  }
) {
  return tx.bountyAssignment.create({
    data: {
      familyId: params.familyId,
      bountyId: params.bountyId,
      userId: params.userId,
      assignedBy: params.assignedBy,
      status: BountyStatus.OFFERED,
      recurrenceSeriesId: params.seriesId,
      occurrenceStartAt: params.occurrenceStartAt,
    },
    include: {
      bounty: true,
      user: {
        select: { id: true, displayName: true, role: true },
      },
    },
  });
}

async function awardStreakMilestonesIfEligible(
  tx: Prisma.TransactionClient,
  params: {
    assignment: {
      id: string;
      familyId: string;
      userId: string;
      bountyId: string;
      recurrenceSeriesId: string | null;
      streakCountAtClose: number | null;
      streakGenerationAtClose: number | null;
    };
    bounty: {
      title: string;
      emoji: string;
      streakEnabled: boolean;
      streakMilestones: Array<{
        id: string;
        threshold: number;
        rewardType: string;
        rewardValue: string;
      }>;
    };
    series: {
      currentStreak: number;
      streakGeneration: number;
    } | null;
    parentName: string;
    childName: string;
  }
): Promise<
  Array<{
    type: "TICKETS" | "CUSTOM";
    threshold: number;
    rewardValue: string;
    ticketsAwarded?: number;
    rewardAssignmentId?: string;
  }>
> {
  const { assignment, bounty, series, parentName, childName } = params;
  if (
    !assignment.recurrenceSeriesId ||
    !bounty.streakEnabled ||
    !bounty.streakMilestones.length
  ) {
    return [];
  }

  const streakCount =
    assignment.streakCountAtClose ??
    (series ? series.currentStreak + 1 : null);
  const streakGeneration =
    assignment.streakGenerationAtClose ??
    series?.streakGeneration ??
    0;

  if (!streakCount || streakCount < 1) {
    return [];
  }

  const existing = await tx.bountyStreakAward.findMany({
    where: {
      seriesId: assignment.recurrenceSeriesId,
      streakGeneration,
    },
    select: { milestoneId: true },
  });
  const existingMilestoneIds = new Set(existing.map((item) => item.milestoneId));

  const granted: Array<{
    type: "TICKETS" | "CUSTOM";
    threshold: number;
    rewardValue: string;
    ticketsAwarded?: number;
    rewardAssignmentId?: string;
  }> = [];

  for (const milestone of bounty.streakMilestones) {
    if (milestone.threshold > streakCount || existingMilestoneIds.has(milestone.id)) {
      continue;
    }

    if (milestone.rewardType === "TICKETS") {
      const ticketsAwarded = parseInt(milestone.rewardValue, 10);
      if (!Number.isFinite(ticketsAwarded) || ticketsAwarded <= 0) {
        continue;
      }

      await tx.user.update({
        where: { id: assignment.userId },
        data: {
          ticketBalance: { increment: ticketsAwarded },
        },
      });

      await tx.bountyStreakAward.create({
        data: {
          seriesId: assignment.recurrenceSeriesId,
          milestoneId: milestone.id,
          bountyAssignmentId: assignment.id,
          streakGeneration,
          threshold: milestone.threshold,
          rewardType: "TICKETS",
          rewardValue: String(ticketsAwarded),
          ticketsAwarded,
        },
      });

      await addHistoryEvent(
        {
          familyId: assignment.familyId,
          userId: assignment.userId,
          userName: childName,
          title: `Streak ${milestone.threshold}`,
          emoji: "🔥",
          action: "EARNED_STREAK_TICKETS",
          assignerName: parentName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: assignment.id,
            bountyId: assignment.bountyId,
            rewardType: "TICKETS",
            rewardValue: String(ticketsAwarded),
            linkedAction: "EARNED_STREAK_TICKETS",
          }),
        },
        tx
      );

      await addNotification(
        {
          userId: assignment.userId,
          message: `Streak milestone hit! +${ticketsAwarded} tickets for ${milestone.threshold} in a row on "${bounty.title}".`,
        },
        tx
      );

      granted.push({
        type: "TICKETS",
        threshold: milestone.threshold,
        rewardValue: String(ticketsAwarded),
        ticketsAwarded,
      });
      continue;
    }

    if (milestone.rewardType === "CUSTOM") {
      const createdReward = await tx.assignedPrize.create({
        data: {
          familyId: assignment.familyId,
          userId: assignment.userId,
          assignedBy: parentName,
          status: PrizeStatus.AVAILABLE,
          title: milestone.rewardValue,
          emoji: "🔥",
          description: `Streak reward for ${milestone.threshold} in a row on "${bounty.title}"`,
          type: PrizeType.PRIVILEGE,
          themeColor: "bg-orange-100 text-orange-800 border-orange-200",
        },
      });

      await tx.bountyStreakAward.create({
        data: {
          seriesId: assignment.recurrenceSeriesId,
          milestoneId: milestone.id,
          bountyAssignmentId: assignment.id,
          streakGeneration,
          threshold: milestone.threshold,
          rewardType: "CUSTOM",
          rewardValue: milestone.rewardValue,
          rewardAssignmentId: createdReward.id,
        },
      });

      await addHistoryEvent(
        {
          familyId: assignment.familyId,
          userId: assignment.userId,
          userName: childName,
          title: milestone.rewardValue,
          emoji: "🔥",
          action: "STREAK_REWARD_GRANTED",
          assignerName: parentName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: assignment.id,
            bountyId: assignment.bountyId,
            rewardAssignmentId: createdReward.id,
            rewardType: "CUSTOM",
            rewardValue: milestone.rewardValue,
            linkedAction: "STREAK_REWARD_GRANTED",
          }),
        },
        tx
      );

      await addNotification(
        {
          userId: assignment.userId,
          message: `Streak milestone hit! Reward "${milestone.rewardValue}" added for ${milestone.threshold} in a row on "${bounty.title}".`,
        },
        tx
      );

      granted.push({
        type: "CUSTOM",
        threshold: milestone.threshold,
        rewardValue: milestone.rewardValue,
        rewardAssignmentId: createdReward.id,
      });
    }
  }

  return granted;
}

/**
 * GET /families/:familyId/bounties
 * List all bounty templates for a family
 */
export const getFamilyBounties = async (req: Request, res: Response) => {
  const { familyId } = req.params;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    // Ensure caller is in the family
    await assertFamilyMember(req, familyId);

    const bounties = await prisma.bounty.findMany({
      where: { familyId },
      orderBy: { createdAt: "desc" },
      include: {
        streakMilestones: {
          orderBy: { threshold: "asc" },
        },
      },
    });

    return res.json(bounties);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("getFamilyBounties error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * POST /families/:familyId/bounties
 * Create a new bounty template
 */
export const createBounty = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const payload = req.body as Record<string, unknown>;
  const {
    title,
    emoji,
    rewardType,
    rewardValue,
    isFCFS,
    rewardTemplateId,
    themeColor,
    deadlineHours,
    requiresPhoto,
  } = payload;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }
  if (!title || !emoji || !rewardValue) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  // Validate deadline if provided
  if (deadlineHours !== undefined && deadlineHours !== null) {
    const hours = Number(deadlineHours);
    if (isNaN(hours) || hours < 1) {
      return res.status(400).json({ error: "INVALID_DEADLINE_HOURS" });
    }
  }

  const recurrenceInput = normalizeRecurrenceInput(payload);
  const recurrenceError = validateRecurrenceInput(recurrenceInput, !!isFCFS);
  if (recurrenceError) {
    return res.status(400).json({ error: recurrenceError });
  }
  if (recurrenceInput.recurrenceEnabled && deadlineHours) {
    return res.status(400).json({ error: "RECURRING_NOT_ALLOWED_WITH_DEADLINE" });
  }

  try {
    const user = await assertFamilyMember(req, familyId);
    assertParent(user);

    const bounty = await prisma.$transaction(async (tx) => {
      const created = await tx.bounty.create({
        data: {
          familyId,
          title: String(title),
          emoji: String(emoji),
          rewardType: typeof rewardType === "string" ? rewardType : null,
          rewardValue: String(rewardValue),
          isFCFS: !!isFCFS,
          rewardTemplateId: typeof rewardTemplateId === "string" ? rewardTemplateId : null,
          themeColor: typeof themeColor === "string" ? themeColor : null,
          deadlineHours: deadlineHours ? Number(deadlineHours) : null,
          requiresPhoto: !!requiresPhoto,
          recurrenceEnabled: recurrenceInput.recurrenceEnabled,
          recurrenceCadence: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrenceCadence
            : null,
          recurrencePattern: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrencePattern
            : null,
          recurrenceDayOfWeek: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrenceDayOfWeek
            : null,
          recurrenceDayOfMonth: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrenceDayOfMonth
            : null,
          recurrenceWeekOfMonth: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrenceWeekOfMonth
            : null,
          recurrenceMonthOfYear: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrenceMonthOfYear
            : null,
          streakEnabled: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.streakEnabled
            : false,
        },
      });

      if (recurrenceInput.recurrenceEnabled && recurrenceInput.streakEnabled) {
        if (recurrenceInput.streakMilestones.length > 0) {
          await tx.bountyStreakMilestone.createMany({
            data: recurrenceInput.streakMilestones.map((m) => ({
              bountyId: created.id,
              threshold: m.threshold,
              rewardType: m.rewardType,
              rewardValue: m.rewardValue,
            })),
          });
        }
      }

      return tx.bounty.findUnique({
        where: { id: created.id },
        include: {
          streakMilestones: true,
        },
      });
    });

    const event: SseEvent = {
      type: "TEMPLATE_UPDATE",
      familyId,
      target: "BOUNTY_TEMPLATE",
      action: "CREATED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

    return res.status(201).json(bounty);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("createBounty error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * PUT /bounties/:id
 * Update an existing bounty template
 */
export const updateBounty = async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body as Record<string, unknown>;
  const {
    title,
    emoji,
    rewardType,
    rewardValue,
    isFCFS,
    rewardTemplateId,
    themeColor,
    deadlineHours,
    requiresPhoto,
  } = payload;

  if (!id) {
    return res.status(400).json({ error: "MISSING_BOUNTY_ID" });
  }

  try {
    const existing = await prisma.bounty.findUnique({
      where: { id },
      include: {
        streakMilestones: {
          orderBy: { threshold: "asc" },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, existing.familyId);
    assertParent(user);
    const familyId = existing.familyId;
    
    // Validate deadlineHours if provided
    if (deadlineHours !== undefined && deadlineHours !== null) {
      const hours = Number(deadlineHours);
      if (!Number.isFinite(hours) || hours < 1) {
        return res.status(400).json({ error: "DEADLINE_MUST_BE_AT_LEAST_1_HOUR" });
      }
    }
    
    const recurrenceInput = normalizeRecurrenceInput({
      recurrenceEnabled:
        payload.recurrenceEnabled !== undefined
          ? payload.recurrenceEnabled
          : existing.recurrenceEnabled,
      recurrenceCadence:
        payload.recurrenceCadence !== undefined
          ? payload.recurrenceCadence
          : existing.recurrenceCadence,
      recurrencePattern:
        payload.recurrencePattern !== undefined
          ? payload.recurrencePattern
          : existing.recurrencePattern,
      recurrenceDayOfWeek:
        payload.recurrenceDayOfWeek !== undefined
          ? payload.recurrenceDayOfWeek
          : existing.recurrenceDayOfWeek,
      recurrenceDayOfMonth:
        payload.recurrenceDayOfMonth !== undefined
          ? payload.recurrenceDayOfMonth
          : existing.recurrenceDayOfMonth,
      recurrenceWeekOfMonth:
        payload.recurrenceWeekOfMonth !== undefined
          ? payload.recurrenceWeekOfMonth
          : existing.recurrenceWeekOfMonth,
      recurrenceMonthOfYear:
        payload.recurrenceMonthOfYear !== undefined
          ? payload.recurrenceMonthOfYear
          : existing.recurrenceMonthOfYear,
      streakEnabled:
        payload.streakEnabled !== undefined
          ? payload.streakEnabled
          : existing.streakEnabled,
      streakMilestones:
        payload.streakMilestones !== undefined
          ? payload.streakMilestones
          : existing.streakMilestones.map((m) => ({
              threshold: m.threshold,
              rewardType: m.rewardType,
              rewardValue: m.rewardValue,
            })),
    });
    const normalizedIsFcfs =
      typeof isFCFS === "boolean" ? isFCFS : existing.isFCFS;
    const recurrenceError = validateRecurrenceInput(
      recurrenceInput,
      normalizedIsFcfs
    );
    if (recurrenceError) {
      return res.status(400).json({ error: recurrenceError });
    }
    const normalizedDeadlineHours =
      deadlineHours !== undefined
        ? deadlineHours
          ? Number(deadlineHours)
          : null
        : existing.deadlineHours;
    if (recurrenceInput.recurrenceEnabled && normalizedDeadlineHours) {
      return res.status(400).json({ error: "RECURRING_NOT_ALLOWED_WITH_DEADLINE" });
    }
    
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.bounty.update({
        where: { id },
        data: {
          title: title ? String(title) : existing.title,
          emoji: emoji ? String(emoji) : existing.emoji,
          rewardType:
            rewardType !== undefined && typeof rewardType === "string"
              ? rewardType
              : existing.rewardType,
          rewardValue: rewardValue ? String(rewardValue) : existing.rewardValue,
          isFCFS: normalizedIsFcfs,
          rewardTemplateId:
            rewardTemplateId !== undefined
              ? (typeof rewardTemplateId === "string" ? rewardTemplateId : null)
              : existing.rewardTemplateId,
          themeColor:
            themeColor !== undefined
              ? (typeof themeColor === "string" ? themeColor : null)
              : existing.themeColor,
          deadlineHours:
            deadlineHours !== undefined
              ? deadlineHours
                ? Number(deadlineHours)
                : null
              : existing.deadlineHours,
          requiresPhoto:
            typeof requiresPhoto === "boolean"
              ? requiresPhoto
              : existing.requiresPhoto,
          recurrenceEnabled: recurrenceInput.recurrenceEnabled,
          recurrenceCadence: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrenceCadence
            : null,
          recurrencePattern: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrencePattern
            : null,
          recurrenceDayOfWeek: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrenceDayOfWeek
            : null,
          recurrenceDayOfMonth: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrenceDayOfMonth
            : null,
          recurrenceWeekOfMonth: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrenceWeekOfMonth
            : null,
          recurrenceMonthOfYear: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.recurrenceMonthOfYear
            : null,
          streakEnabled: recurrenceInput.recurrenceEnabled
            ? recurrenceInput.streakEnabled
            : false,
        },
      });

      await tx.bountyStreakMilestone.deleteMany({
        where: { bountyId: id },
      });

      if (
        recurrenceInput.recurrenceEnabled &&
        recurrenceInput.streakEnabled &&
        recurrenceInput.streakMilestones.length
      ) {
        await tx.bountyStreakMilestone.createMany({
          data: recurrenceInput.streakMilestones.map((m) => ({
            bountyId: id,
            threshold: m.threshold,
            rewardType: m.rewardType,
            rewardValue: m.rewardValue,
          })),
        });
      }

      return tx.bounty.findUnique({
        where: { id: next.id },
        include: { streakMilestones: true },
      });
    });

    const event: SseEvent = {
      type: "TEMPLATE_UPDATE",
      familyId,
      target: "BOUNTY_TEMPLATE",
      action: "UPDATED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("updateBounty error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * DELETE /bounties/:id
 * Delete a bounty template (and its assignments)
 */
export const deleteBounty = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_BOUNTY_ID" });
  }

  try {
    const existing = await prisma.bounty.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, existing.familyId);
    assertParent(user);
    const familyId = existing.familyId;
    // Remove assignments first (to avoid FK issues)
    await prisma.bountyAssignment.deleteMany({
      where: { bountyId: id },
    });

    await prisma.bounty.delete({ where: { id } });

    const event: SseEvent = {
      type: "TEMPLATE_UPDATE",
      familyId,
      target: "BOUNTY_TEMPLATE",
      action: "DELETED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

    return res.status(204).send();
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("deleteBounty error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * GET /families/:familyId/bounty-assignments
 * List all bounty assignments for a family
 */
export const getFamilyBountyAssignments = async (
  req: Request,
  res: Response
) => {
  const { familyId } = req.params;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    await assertFamilyMember(req, familyId);

    const assignments = await prisma.bountyAssignment.findMany({
      where: { familyId },
      orderBy: { assignedAt: "desc" },
      include: {
        bounty: true,
        recurrenceSeries: {
          select: {
            id: true,
            pausedAt: true,
            autoResumeSkipAt: true,
            currentStreak: true,
            active: true,
            nextOccurrenceAt: true,
            currentAssignmentId: true,
          },
        },
        user: {
          select: {
            id: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    // Fetch assigner details for each assignment
    const enrichedAssignments = await Promise.all(
      assignments.map(async (assignment) => {
        const assigner = await prisma.user.findUnique({
          where: { id: assignment.assignedBy },
          select: { displayName: true },
        });

        return {
          ...assignment,
          assignerName: assigner?.displayName || 'Parent',
          recurrenceSeriesId: assignment.recurrenceSeriesId,
          seriesActive: !!assignment.recurrenceSeries?.active,
          seriesPaused: !!assignment.recurrenceSeries?.pausedAt,
          seriesPausedAt: assignment.recurrenceSeries?.pausedAt ?? null,
          seriesAutoResumeSkipAt: assignment.recurrenceSeries?.autoResumeSkipAt ?? null,
          currentStreak: assignment.recurrenceSeries?.currentStreak ?? 0,
          streakEnabled: !!assignment.bounty?.streakEnabled,
          isRecurring: !!assignment.bounty?.recurrenceEnabled,
          nextOccurrenceAt: assignment.recurrenceSeries?.nextOccurrenceAt ?? null,
          isCurrentOccurrence:
            !!assignment.recurrenceSeries &&
            assignment.recurrenceSeries.currentAssignmentId === assignment.id,
        };
      })
    );

    return res.json(enrichedAssignments);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("getFamilyBountyAssignments error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * POST /families/:familyId/bounty-assignments
 * Assign a bounty to a child
 */
// Make sure you have this import at the top of bountyController.ts:
// import { sendPushToUser } from "../services/pushService.js";

export const assignBounty = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { bountyId, userId } = req.body;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }
  if (!bountyId || !userId) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const parent = await assertFamilyMember(req, familyId);
    assertParent(parent);

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
    });

    if (!bounty || bounty.familyId !== familyId) {
      return res.status(404).json({ error: "BOUNTY_NOT_FOUND" });
    }

    const child = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!child || child.familyId !== familyId) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    if (child.id === parent.id) {
      return res
        .status(400)
        .json({ error: "CANNOT_ASSIGN_TASK_TO_SELF" });
    }

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = child.displayName || child.username || "Child";
    const emoji = bounty.emoji || "🧹";
    const title = bounty.title || "Task";
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      select: { timezone: true },
    });

    if (bounty.recurrenceEnabled && bounty.isFCFS) {
      return res.status(400).json({ error: "RECURRING_NOT_ALLOWED_WITH_FCFS" });
    }
    if (bounty.recurrenceEnabled && bounty.deadlineHours) {
      return res.status(400).json({ error: "RECURRING_NOT_ALLOWED_WITH_DEADLINE" });
    }
    if (bounty.recurrenceEnabled && !bounty.recurrenceCadence) {
      return res.status(400).json({ error: "INVALID_RECURRING_CONFIGURATION" });
    }

    // Assignment + history + notification as one atomic unit
    const assignmentResult = await prisma.$transaction(async (tx) => {
      if (bounty.recurrenceEnabled) {
        const existingSeries = await tx.bountyRecurrenceSeries.findUnique({
          where: {
            bountyId_userId: {
              bountyId,
              userId,
            },
          },
          include: {
            currentAssignment: {
              include: {
                bounty: true,
                user: {
                  select: { id: true, displayName: true, role: true },
                },
              },
            },
          },
        });

        if (
          existingSeries &&
          existingSeries.active &&
          existingSeries.currentAssignmentId &&
          existingSeries.currentAssignment
        ) {
          return { assignment: existingSeries.currentAssignment, createdNew: false };
        }

        const now = new Date();
        const timezone = getEffectiveTimezone(family?.timezone);
        const nextOccurrenceAt = computeInitialNextOccurrence(
          timezone,
          bountyRecurrenceConfig(bounty),
          now
        );

        let seriesId: string;
        if (!existingSeries) {
          const createdSeries = await tx.bountyRecurrenceSeries.create({
            data: {
              familyId,
              bountyId,
              userId,
              assignedBy: parent.id,
              active: true,
              pausedAt: null,
              autoResumeSkipAt: null,
              nextOccurrenceAt,
            },
          });
          seriesId = createdSeries.id;
        } else {
          const reactivated = await tx.bountyRecurrenceSeries.update({
            where: { id: existingSeries.id },
            data: {
              active: true,
              pausedAt: null,
              autoResumeSkipAt: null,
              nextOccurrenceAt,
            },
          });
          seriesId = reactivated.id;
        }

        const created = await createRecurringAssignment(tx, {
          familyId,
          bountyId,
          userId,
          assignedBy: parent.id,
          seriesId,
          occurrenceStartAt: now,
        });

        await tx.bountyRecurrenceSeries.update({
          where: { id: seriesId },
          data: {
            currentAssignmentId: created.id,
          },
        });

        await addHistoryEvent(
          {
            familyId,
            userId: child.id,
            userName: childName,
            title,
            emoji,
            action: "TASK_ASSIGNED",
            assignerName: parentName,
            metadata: buildTaskLifecycleMetadata({
              bountyAssignmentId: created.id,
              bountyId: bounty.id,
              rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
              rewardValue: bounty.rewardValue,
              linkedAction: "TASK_ASSIGNED",
            }),
          },
          tx
        );

        await addNotification(
          {
            userId: child.id,
            message: `${parentName} assigned you a new task: ${title}`,
          },
          tx
        );

        return { assignment: created, createdNew: true };
      }

      const created = await tx.bountyAssignment.create({
        data: {
          familyId,
          bountyId,
          userId,
          assignedBy: parent.id,
          status: BountyStatus.OFFERED,
        },
        include: {
          bounty: true,
          user: {
            select: { id: true, displayName: true, role: true },
          },
        },
      });

      await addHistoryEvent(
        {
          familyId,
          userId: child.id,
          userName: childName,
          title,
          emoji,
          action: "TASK_ASSIGNED",
          assignerName: parentName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: created.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: "TASK_ASSIGNED",
          }),
        },
        tx
      );

      await addNotification(
        {
          userId: child.id,
          message: `${parentName} assigned you a new task: ${title}`,
        },
        tx
      );

      return { assignment: created, createdNew: true };
    });

    const assignment = assignmentResult.assignment;

    // Push (non-blocking safety)
    if (assignmentResult.createdNew) {
      try {
        await sendPushToUser(child.id, {
          title: "New task assigned 🧹",
          body: `${parentName} assigned: ${title}`,
          tag: "task-assigned",
          type: "TASK_ASSIGNED",
          familyId,
          bountyId: bounty.id,
          assignmentId: assignment.id,

          // Deep link for your App.tsx + WalletView parser
          url: "/?view=wallet&walletTab=tasks",
        });
      } catch (pushErr) {
        // Don't fail the request just because push failed
        console.warn("assignBounty push failed:", pushErr);
      }
    }

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId,
      reason: "TASK_ASSIGNED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

    return res.status(assignmentResult.createdNew ? 201 : 200).json(assignment);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("assignBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /bounty-assignments/:id/accept
// POST /bounty-assignments/:id/accept
export const acceptAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.bountyAssignment.findUnique({
      where: { id },
      include: {
        bounty: true,
        recurrenceSeries: {
          select: { pausedAt: true },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const bounty = assignment.bounty;
    if (!bounty) {
      return res.status(404).json({ error: "BOUNTY_NOT_FOUND" });
    }
    if (assignment.recurrenceSeries?.pausedAt) {
      return res.status(409).json({ error: "SERIES_PAUSED" });
    }

    // Only the assigned child can accept
    const user = await assertFamilyMember(req, assignment.familyId);
    if (user.id !== assignment.userId) {
      return res.status(403).json({ error: "ONLY_ASSIGNEE_CAN_ACCEPT" });
    }

    if (assignment.status !== BountyStatus.OFFERED) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    const childName = user.displayName || user.username || "Child";
    const emoji = bounty.emoji || "🧹";
    const title = bounty.title || "Task";

    // We'll capture these inside the transaction so we don't re-query later
    let parentIds: string[] = [];
    let fcfsLoserUserIds: string[] = [];

    const updated = await prisma.$transaction(async (tx) => {
      // If FCFS, preload the other OFFERED assignments so we can notify losers
      if (bounty.isFCFS) {
        const others = await tx.bountyAssignment.findMany({
          where: {
            bountyId: assignment.bountyId,
            familyId: assignment.familyId,
            status: BountyStatus.OFFERED,
            NOT: { id: assignment.id },
          },
          select: { id: true, userId: true },
        });

        fcfsLoserUserIds = others.map((o) => o.userId);

        if (others.length) {
          const fcfsLosers = await tx.user.findMany({
            where: { id: { in: fcfsLoserUserIds } },
            select: { id: true, displayName: true, username: true },
          });

          for (const loser of fcfsLosers) {
            const loserName = loser.displayName || loser.username || "Child";
            await addHistoryEvent(
              {
                familyId: assignment.familyId,
                userId: loser.id,
                userName: loserName,
                title,
                emoji,
                action: "TASK_MISSED_FCFS",
                assignerName: childName,
                metadata: buildTaskLifecycleMetadata({
                  bountyAssignmentId: others.find((o) => o.userId === loser.id)?.id || assignment.id,
                  bountyId: bounty.id,
                  rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
                  rewardValue: bounty.rewardValue,
                  linkedAction: "TASK_MISSED_FCFS",
                  fcfsClaimedByUserId: user.id,
                  fcfsClaimedByName: childName,
                }),
              },
              tx
            );
          }

          await tx.bountyAssignment.deleteMany({
            where: { id: { in: others.map((o) => o.id) } },
          });
        }
      }

      // Calculate deadline expiration if bounty has a deadline
      const now = new Date();
      let deadlineExpiresAt: Date | undefined;
      if (bounty.deadlineHours) {
        deadlineExpiresAt = new Date(now.getTime() + bounty.deadlineHours * 3600000);
      }

      const updatedAssignment = await tx.bountyAssignment.update({
        where: { id },
        data: { 
          status: BountyStatus.IN_PROGRESS,
          deadlineStartedAt: bounty.deadlineHours ? now : undefined,
          deadlineExpiresAt: deadlineExpiresAt,
        },
      });

      await addHistoryEvent(
        {
          familyId: assignment.familyId,
          userId: assignment.userId,
          userName: childName,
          title,
          emoji,
          action: "TASK_ACCEPTED", // keep your action string for consistency
          assignerName: childName, // actor is the child
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: assignment.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: "TASK_ACCEPTED",
          }),
        },
        tx
      );

      const parents = await tx.user.findMany({
        where: { familyId: assignment.familyId, role: "PARENT" },
        select: { id: true },
      });

      parentIds = parents.map((p) => p.id);

      // Parent in-app notifications
      await Promise.all(
        parentIds.map((pid) =>
          addNotification(
            {
              userId: pid,
              message: bounty.isFCFS
                ? `${childName} accepted FCFS task: ${title}`
                : `${childName} accepted task: ${title}`,
            },
            tx
          )
        )
      );

      // FCFS loser in-app notifications
      if (bounty.isFCFS && fcfsLoserUserIds.length) {
        await Promise.all(
          fcfsLoserUserIds.map((uid) =>
            addNotification(
              {
                userId: uid,
                message: `Too late — "${title}" was claimed by ${childName}.`,
              },
              tx
            )
          )
        );
      }

      return updatedAssignment;
    });

    // Push to parents (after transaction succeeds)
    try {
      await Promise.all(
        parentIds.map((pid) =>
          sendPushToUser(pid, {
            title: "Task accepted ✅",
            body: bounty.isFCFS
              ? `${childName} accepted FCFS task: ${title}`
              : `${childName} accepted: ${title}`,
            tag: "task-accepted",
            type: "TASK_ACCEPTED",
            familyId: assignment.familyId,
            bountyId: bounty.id,
            assignmentId: assignment.id,

            // Accept doesn't need approvals — tasks view is more logical
            url: "/?view=admin&adminTab=tasks",
          })
        )
      );
    } catch (pushErr) {
      console.warn("acceptAssignedBounty parent push failed:", pushErr);
    }

    // Optional: push to FCFS losers (nice UX)
    if (bounty.isFCFS && fcfsLoserUserIds.length) {
      await Promise.all(
        fcfsLoserUserIds.map((uid) =>
          sendPushToUser(uid, {
            title: "Task already claimed",
            body: `"${title}" was claimed by ${childName}.`,
            tag: "task-fcfs-missed",
            type: "TASK_FCFS_MISSED",
            familyId: assignment.familyId,
            bountyId: bounty.id,
            url: "/?view=wallet&walletTab=tasks",
          }).catch((err) =>
            console.warn("acceptAssignedBounty loser push failed:", err)
          )
        )
      );
    }

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: assignment.familyId,
      reason: "TASK_ACCEPTED",
      timestamp: Date.now(),
    };

    broadcastToFamily(assignment.familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("acceptAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};



// POST /bounty-assignments/:id/complete
export const completeAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;
  let { photoUrl } = req.body;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.bountyAssignment.findUnique({
      where: { id },
      include: {
        bounty: true,
        user: true,
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const bounty = assignment.bounty;
    const child = assignment.user;

    if (!bounty || !child) {
      return res.status(500).json({ error: "BOUNTY_OR_CHILD_MISSING" });
    }

    // Only the assigned child can complete
    const user = await assertFamilyMember(req, assignment.familyId);
    if (user.id !== assignment.userId) {
      return res.status(403).json({ error: "ONLY_ASSIGNEE_CAN_COMPLETE" });
    }

    // Validate photo requirement
    if (bounty.requiresPhoto && !photoUrl) {
      return res.status(400).json({ error: "PHOTO_REQUIRED" });
    }

    // Process photo if provided (resize and compress)
    if (photoUrl && photoUrl.startsWith('data:image/')) {
      photoUrl = await processTaskPhoto(photoUrl);
    }

    // Allow completion from IN_PROGRESS or DENIED (resubmission after denial)
    if (assignment.status !== BountyStatus.IN_PROGRESS && assignment.status !== BountyStatus.DENIED) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    const childName = child.displayName || child.username || "Child";
    const emoji = bounty.emoji || "🧹";
    const title = bounty.title || "Task";
    const now = new Date();

    let parentIds: string[] = [];

    const updated = await prisma.$transaction(async (tx) => {
      const updatedAssignment = await tx.bountyAssignment.update({
        where: { id },
        data: {
          status: BountyStatus.COMPLETED,
          completedAt: now,
          photoUrl: photoUrl ?? null,
          // Clear denial reason and notes if resubmitting after denial
          denialReason: null,
          denialNotes: null,
          deniedAt: null,
        },
      });

      await addHistoryEvent(
        {
          familyId: assignment.familyId,
          userId: assignment.userId,
          userName: childName,
          title,
          emoji,
          action: "TASK_COMPLETED",
          assignerName: childName, // actor is the child
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: assignment.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: "TASK_COMPLETED",
          }),
        },
        tx
      );

      const parents = await tx.user.findMany({
        where: { familyId: assignment.familyId, role: "PARENT" },
        select: { id: true },
      });

      parentIds = parents.map((p) => p.id);

      await Promise.all(
        parentIds.map((pid) =>
          addNotification(
            {
              userId: pid,
              message: `${childName} marked task "${title}" as complete. Waiting for verification.`,
            },
            tx
          )
        )
      );

      return updatedAssignment;
    });

    // Push to parents: "verification needed"
    try {
      await Promise.all(
        parentIds.map((pid) =>
          sendPushToUser(pid, {
            title: "Task completed 🧹",
            body: `${childName} completed: ${title}. Tap to verify.`,
            tag: "task-completed",
            type: "TASK_COMPLETED",
            familyId: assignment.familyId,
            bountyId: bounty.id,
            assignmentId: assignment.id,
            childId: child.id,

            // Deep link to parent manage tab
            url: "/?view=admin&adminTab=manage",
          })
        )
      );
    } catch (pushErr) {
      console.warn("completeAssignedBounty push failed:", pushErr);
    }

    // Broadcast to admin dashboards (child action)
    const event: SseEvent = {
      type: "CHILD_ACTION",
      familyId: assignment.familyId,
      subtype: "TASK_COMPLETED",
      id,
      userId: user.id,
      timestamp: Date.now(),
    };

    broadcastToFamily(assignment.familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("completeAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /bounty-assignments/:id/verify
export const verifyAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const existingAssignment = await prisma.bountyAssignment.findUnique({
      where: { id },
      include: {
        bounty: {
          include: {
            streakMilestones: {
              orderBy: { threshold: "asc" },
            },
          },
        },
        user: true,
        recurrenceSeries: {
          select: {
            currentStreak: true,
            streakGeneration: true,
          },
        },
      },
    });

    if (!existingAssignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const bounty = existingAssignment.bounty;
    const child = existingAssignment.user;

    if (!bounty || !child) {
      return res.status(500).json({ error: "BOUNTY_OR_CHILD_MISSING" });
    }

    const parent = await assertFamilyMember(req, existingAssignment.familyId);
    assertParent(parent);

    if (parent.id === child.id) {
      return res
        .status(403)
        .json({ error: "CANNOT_VERIFY_OWN_TASK" });
    }
    
    if (existingAssignment.status !== BountyStatus.COMPLETED) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    // 1) Mark bounty assignment VERIFIED
    const updatedAssignment = await prisma.bountyAssignment.update({
      where: { id },
      data: {
        status: BountyStatus.VERIFIED,
        completedAt: existingAssignment.completedAt ?? new Date(),
      },
    });

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = child.displayName || child.username || "Child";

    // 2) Check if this is a ticket-based reward
    if (bounty.rewardType === 'TICKETS') {
      // Add tickets directly to child's balance
      const ticketAmount = parseInt(bounty.rewardValue);
      
      if (isNaN(ticketAmount) || ticketAmount <= 0) {
        return res.status(400).json({ error: "INVALID_TICKET_AMOUNT" });
      }

      const streakRewards = await prisma.$transaction(async (tx) => {
        // Update child's ticket balance
        await tx.user.update({
          where: { id: child.id },
          data: {
            ticketBalance: {
              increment: ticketAmount,
            },
          },
        });

        // Log task verification
        await addHistoryEvent(
          {
            familyId: existingAssignment.familyId,
            userId: existingAssignment.userId,
            userName: childName,
            title: bounty.title,
            emoji: bounty.emoji || "🧹",
            action: "VERIFIED_TASK",
            assignerName: parentName,
            metadata: buildTaskLifecycleMetadata({
              bountyAssignmentId: existingAssignment.id,
              bountyId: bounty.id,
              rewardType: "TICKETS",
              rewardValue: String(ticketAmount),
              linkedAction: "VERIFIED_TASK",
            }),
          },
          tx
        );

        // Log ticket earnings
        await addHistoryEvent(
          {
            familyId: existingAssignment.familyId,
            userId: existingAssignment.userId,
            userName: childName,
            title: `${ticketAmount} Tickets`,
            emoji: "🎟️",
            action: "EARNED_TICKETS",
            assignerName: parentName,
            metadata: buildTaskLifecycleMetadata({
              bountyAssignmentId: existingAssignment.id,
              bountyId: bounty.id,
              rewardType: "TICKETS",
              rewardValue: String(ticketAmount),
              linkedAction: "EARNED_TICKETS",
            }),
          },
          tx
        );

        await addNotification(
          {
            userId: existingAssignment.userId,
            message: `Task "${bounty.title}" verified! +${ticketAmount} tickets.`,
          },
          tx
        );

        return awardStreakMilestonesIfEligible(tx, {
          assignment: {
            id: existingAssignment.id,
            familyId: existingAssignment.familyId,
            userId: existingAssignment.userId,
            bountyId: existingAssignment.bountyId,
            recurrenceSeriesId: existingAssignment.recurrenceSeriesId,
            streakCountAtClose: existingAssignment.streakCountAtClose,
            streakGenerationAtClose: existingAssignment.streakGenerationAtClose,
          },
          bounty: {
            title: bounty.title,
            emoji: bounty.emoji || "🧹",
            streakEnabled: bounty.streakEnabled,
            streakMilestones: bounty.streakMilestones,
          },
          series: existingAssignment.recurrenceSeries,
          parentName,
          childName,
        });
      });

      // Send push notification
      try {
        await sendPushToUser(child.id, {
          title: "Your task was verified ✅",
          body: `${parentName} verified: ${bounty.title}. +${ticketAmount} tickets!`,
          tag: "task-verified",
          type: "TASK_VERIFIED",
          familyId: existingAssignment.familyId,
          assignmentId: existingAssignment.id,
          url: "/?view=wallet&walletTab=tasks",
        });
      } catch (pushErr) {
        console.warn("verifyAssignedBounty push failed:", pushErr);
      }

      const event: SseEvent = {
        type: "WALLET_UPDATE",
        familyId: existingAssignment.familyId,
        reason: "TASK_VERIFIED",
        timestamp: Date.now(),
      };

      broadcastToFamily(existingAssignment.familyId, event);

      return res.json({
        assignment: updatedAssignment,
        ticketsAwarded: ticketAmount,
        streakRewards,
      });
    }

    // 3) Custom reward - Build snapshot fields for reward card
    let templateId: string | null = null;
    let snapshotTitle: string;
    let snapshotEmoji: string;
    let snapshotDescription: string | null;
    let snapshotType: PrizeType;
    let snapshotThemeColor: string | null;

    if (bounty.rewardTemplateId) {
      const template = await prisma.reward.findUnique({
        where: { id: bounty.rewardTemplateId },
      });

      if (template) {
        templateId = template.id;
        snapshotTitle = template.title;
        snapshotEmoji = template.emoji;
        snapshotDescription = template.description ?? null;
        snapshotType = template.type;
        snapshotThemeColor = template.themeColor ?? null;
      } else {
        // fallback when template reference is stale
        snapshotTitle = bounty.rewardValue;
        snapshotEmoji = "🎀";
        snapshotDescription = `Reward for completing: ${bounty.title}`;
        snapshotType = PrizeType.PRIVILEGE;
        snapshotThemeColor = "bg-green-100 text-green-800 border-green-200";
      }
    } else {
      // Bounty-based reward only
      snapshotTitle = bounty.rewardValue;
      snapshotEmoji = "🎀";
      snapshotDescription = `Reward for completing: ${bounty.title}`;
      snapshotType = PrizeType.PRIVILEGE;
      snapshotThemeColor = "bg-green-100 text-green-800 border-green-200";
    }

    // 4) Transaction: create prize, log history, notify child
    const createdPrize = await prisma.$transaction(async (tx) => {
      const prize = await tx.assignedPrize.create({
        data: {
          familyId: existingAssignment.familyId,
          templateId,
          userId: existingAssignment.userId,
          assignedBy: parentName,
          status: PrizeStatus.AVAILABLE,
          assignedAt: new Date(),
          title: snapshotTitle,
          emoji: snapshotEmoji,
          description: snapshotDescription,
          type: snapshotType,
          themeColor: snapshotThemeColor,
        },
      });

      await addHistoryEvent(
        {
          familyId: existingAssignment.familyId,
          userId: existingAssignment.userId,
          userName: childName,
          title: bounty.title,
          emoji: bounty.emoji || "🧹",
          action: "VERIFIED_TASK",
          assignerName: parentName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: existingAssignment.id,
            bountyId: bounty.id,
            rewardType: "CUSTOM",
            rewardValue: snapshotTitle,
            linkedAction: "VERIFIED_TASK",
          }),
        },
        tx
      );

      await addHistoryEvent(
        {
          familyId: existingAssignment.familyId,
          userId: existingAssignment.userId,
          userName: childName,
          title: snapshotTitle,
          emoji: snapshotEmoji,
          action: "TASK_REWARD_GRANTED",
          assignerName: parentName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: existingAssignment.id,
            bountyId: bounty.id,
            rewardAssignmentId: prize.id,
            rewardType: "CUSTOM",
            rewardValue: snapshotTitle,
            linkedAction: "TASK_REWARD_GRANTED",
          }),
        },
        tx
      );

      await addNotification(
        {
          userId: existingAssignment.userId,
          message: `Task "${bounty.title}" verified! Reward added.`,
        },
        tx
      );

      const streakRewards = await awardStreakMilestonesIfEligible(tx, {
        assignment: {
          id: existingAssignment.id,
          familyId: existingAssignment.familyId,
          userId: existingAssignment.userId,
          bountyId: existingAssignment.bountyId,
          recurrenceSeriesId: existingAssignment.recurrenceSeriesId,
          streakCountAtClose: existingAssignment.streakCountAtClose,
          streakGenerationAtClose: existingAssignment.streakGenerationAtClose,
        },
        bounty: {
          title: bounty.title,
          emoji: bounty.emoji || "🧹",
          streakEnabled: bounty.streakEnabled,
          streakMilestones: bounty.streakMilestones,
        },
        series: existingAssignment.recurrenceSeries,
        parentName,
        childName,
      });

      return { prize, streakRewards };
    });

    // --- PUSH NOTIFICATION (fixed) ---
    try {
      await sendPushToUser(child.id, {
        title: "Your task was verified ✅",
        body: `${parentName} verified: ${bounty.title}`,
        tag: "reward-verified",
        type: "REWARD_VERIFIED",
        familyId: existingAssignment.familyId,
        assignmentId: existingAssignment.id,
        // If you want a deep link, adjust as desired:
        url: "/?view=wallet&walletTab=wallet",
      });
    } catch (pushErr) {
      console.warn("verifyAssignedBounty push failed:", pushErr);
    }

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: existingAssignment.familyId,
      reason: "TASK_VERIFIED",
      timestamp: Date.now(),
    };

    broadcastToFamily(existingAssignment.familyId, event);

    // 4) Return updated assignment + created reward snapshot
    return res.json({
      assignment: updatedAssignment,
      prize: createdPrize.prize,
      streakRewards: createdPrize.streakRewards,
    });
  } catch (err) {
    console.error("verifyAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /bounty-assignments/:id/deny
export const denyAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { denialReason, denialNotes, allowResubmit = true } = req.body;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  if (!denialReason) {
    return res.status(400).json({ error: "MISSING_DENIAL_REASON" });
  }

  // Validate the denial reason is one of the enum values
  const validReasons = Object.values(DenialReason);
  if (!validReasons.includes(denialReason)) {
    return res.status(400).json({ error: "INVALID_DENIAL_REASON" });
  }

  try {
    const existingAssignment = await prisma.bountyAssignment.findUnique({
      where: { id },
      include: {
        bounty: true,
        user: true,
      },
    });

    if (!existingAssignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const bounty = existingAssignment.bounty;
    const child = existingAssignment.user;

    if (!bounty || !child) {
      return res.status(500).json({ error: "BOUNTY_OR_CHILD_MISSING" });
    }

    const parent = await assertFamilyMember(req, existingAssignment.familyId);
    assertParent(parent);

    if (parent.id === child.id) {
      return res
        .status(403)
        .json({ error: "CANNOT_DENY_OWN_TASK" });
    }

    if (existingAssignment.status !== BountyStatus.COMPLETED) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    let updatedAssignment;
    
    if (allowResubmit) {
      // Update bounty assignment to DENIED status (child can resubmit)
      updatedAssignment = await prisma.bountyAssignment.update({
        where: { id },
        data: {
          status: BountyStatus.DENIED,
          denialReason,
          denialNotes: denialNotes || null,
          deniedAt: new Date(),
        },
      });
    } else {
      // Delete the assignment entirely (task cancelled, no resubmit)
      updatedAssignment = existingAssignment;
      await prisma.bountyAssignment.delete({
        where: { id },
      });
      if (existingAssignment.recurrenceSeriesId) {
        await prisma.bountyRecurrenceSeries.update({
          where: { id: existingAssignment.recurrenceSeriesId },
          data: {
            pausedAt: null,
            autoResumeSkipAt: null,
            currentStreak: 0,
            streakGeneration: { increment: 1 },
            currentAssignmentId: null,
          },
        });
      }
    }

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = child.displayName || child.username || "Child";

    // Create human-readable reason message
    const reasonMessages: Record<DenialReason, string> = {
      [DenialReason.NOT_COMPLETED_ADEQUATELY]: "Task not completed to adequate standard",
      [DenialReason.TOO_OLD_NO_LONGER_REQUIRED]: "Task too old and no longer required",
      [DenialReason.NOT_COMPLETED]: "Task not completed",
      [DenialReason.INSTRUCTIONS_NOT_FOLLOWED]: "Didn't follow the instructions",
      [DenialReason.LOW_EFFORT]: "Not enough effort / rushed",
      [DenialReason.COMPLETED_AFTER_DEADLINE]: "Completed after the deadline",
    };

    const reasonMessage = reasonMessages[denialReason as DenialReason];
    
    // Build full message with notes if provided
    const fullMessage = denialNotes ? `${reasonMessage}: ${denialNotes}` : reasonMessage;

    // Log task denial in history and add notification in a transaction
    await prisma.$transaction(async (tx) => {
      // Log task denial in history
      await addHistoryEvent(
        {
          familyId: existingAssignment.familyId,
          userId: existingAssignment.userId,
          userName: childName,
          title: bounty.title,
          emoji: bounty.emoji || "🧹",
          action: "DENIED_TASK",
          assignerName: parentName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: existingAssignment.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: "DENIED_TASK",
            denialMessage: fullMessage,
            allowResubmit,
          }),
        },
        tx
      );

      // Add notification to child
      const notificationMessage = allowResubmit
        ? `Task "${bounty.title}" was denied: ${fullMessage}. Please try again!`
        : `Task "${bounty.title}" was cancelled: ${fullMessage}.`;
      
      await addNotification(
        {
          userId: existingAssignment.userId,
          message: notificationMessage,
        },
        tx
      );
    });

    // Send push notification
    try {
      const pushTitle = allowResubmit ? "Task Denied ❌" : "Task Cancelled 🚫";
      const pushBody = allowResubmit
        ? `${parentName} denied: ${bounty.title}. ${fullMessage}.`
        : `${parentName} cancelled: ${bounty.title}. ${fullMessage}.`;
      
      await sendPushToUser(child.id, {
        title: pushTitle,
        body: pushBody,
        tag: "task-denied",
        type: "TASK_DENIED",
        familyId: existingAssignment.familyId,
        assignmentId: existingAssignment.id,
        url: "/?view=wallet&walletTab=tasks",
      });
    } catch (pushErr) {
      console.warn("denyAssignedBounty push failed:", pushErr);
    }

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: existingAssignment.familyId,
      reason: "TASK_DENIED",
      timestamp: Date.now(),
    };

    broadcastToFamily(existingAssignment.familyId, event);

    return res.json({
      assignment: updatedAssignment,
      denialReason: fullMessage,
    });
  } catch (err) {
    console.error("denyAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /bounty-assignments/:id/cancel
export const cancelAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.bountyAssignment.findUnique({
      where: { id },
      include: {
        bounty: true,
        user: true,
        recurrenceSeries: {
          select: { pausedAt: true },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const actor = await assertFamilyMember(req, assignment.familyId);
    const bounty = assignment.bounty;
    const child = assignment.user;

    if (!bounty || !child) {
      return res.status(500).json({ error: "BOUNTY_OR_CHILD_MISSING" });
    }
    if (assignment.recurrenceSeries?.pausedAt) {
      return res.status(409).json({ error: "SERIES_PAUSED" });
    }

    if (assignment.status === BountyStatus.VERIFIED) {
      return res.status(400).json({ error: "CANNOT_CANCEL_VERIFIED_TASK" });
    }

    const canCancel =
      actor.role === Role.PARENT ||
      (actor.role === Role.CHILD && actor.id === assignment.userId);
    if (!canCancel) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const actorName = actor.displayName || actor.username || "User";
    const childName = child.displayName || child.username || "Child";
    const isParentActor = actor.role === Role.PARENT;
    const familyId = assignment.familyId;

    let parentIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      await tx.bountyAssignment.delete({ where: { id } });

      if (assignment.recurrenceSeriesId) {
        await tx.bountyRecurrenceSeries.update({
          where: { id: assignment.recurrenceSeriesId },
          data: {
            pausedAt: null,
            autoResumeSkipAt: null,
            active: true,
            currentStreak: 0,
            streakGeneration: { increment: 1 },
            currentAssignmentId: null,
          },
        });
      }

      await addHistoryEvent(
        {
          familyId,
          userId: assignment.userId,
          userName: childName,
          title: bounty.title,
          emoji: bounty.emoji || "🧹",
          action: "TASK_CANCELLED",
          assignerName: actorName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: assignment.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: "TASK_CANCELLED",
            cancelledByUserId: actor.id,
            cancelledByName: actorName,
          }),
        },
        tx
      );

      if (isParentActor) {
        await addNotification(
          {
            userId: child.id,
            message: `${actorName} cancelled task "${bounty.title}".`,
          },
          tx
        );
      } else {
        const parents = await tx.user.findMany({
          where: { familyId, role: Role.PARENT },
          select: { id: true },
        });
        parentIds = parents.map((p) => p.id);
        await Promise.all(
          parentIds.map((parentId) =>
            addNotification(
              {
                userId: parentId,
                message: `${actorName} cancelled task "${bounty.title}".`,
              },
              tx
            )
          )
        );
      }
    });

    try {
      if (isParentActor) {
        await sendPushToUser(child.id, {
          title: "Task cancelled",
          body: `${actorName} cancelled: ${bounty.title}`,
          tag: "task-cancelled",
          type: "TASK_CANCELLED",
          familyId,
          assignmentId: assignment.id,
          url: "/?view=wallet&walletTab=tasks",
        });
      } else {
        await Promise.all(
          parentIds.map((parentId) =>
            sendPushToUser(parentId, {
              title: "Task cancelled",
              body: `${actorName} cancelled: ${bounty.title}`,
              tag: "task-cancelled",
              type: "TASK_CANCELLED",
              familyId,
              assignmentId: assignment.id,
              url: "/?view=admin&adminTab=manage",
            })
          )
        );
      }
    } catch (pushErr) {
      console.warn("cancelAssignedBounty push failed:", pushErr);
    }

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId,
      reason: "TASK_CANCELLED",
      timestamp: Date.now(),
    };
    broadcastToFamily(familyId, event);

    return res.status(204).send();
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("cancelAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// PUT /bounty-series/:seriesId/pause
export const pauseBountySeries = async (req: Request, res: Response) => {
  const seriesId = req.params.seriesId || req.params.id;
  if (!seriesId) {
    return res.status(400).json({ error: "MISSING_SERIES_ID" });
  }

  try {
    const series = await prisma.bountyRecurrenceSeries.findUnique({
      where: { id: seriesId },
      include: {
        bounty: true,
        user: true,
      },
    });

    if (!series) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const parent = await assertFamilyMember(req, series.familyId);
    assertParent(parent);

    if (!series.active) {
      return res.status(400).json({ error: "SERIES_INACTIVE" });
    }

    if (series.pausedAt) {
      return res.json(series);
    }

    const autoResumeSkipNext = asBooleanWithDefault(
      (req.body as Record<string, unknown> | undefined)?.autoResumeSkipNext,
      true
    );
    const pausedAt = new Date();

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = series.user.displayName || series.user.username || "Child";

    const updated = await prisma.$transaction(async (tx) => {
      const pausedSeries = await tx.bountyRecurrenceSeries.update({
        where: { id: seriesId },
        data: {
          pausedAt,
          autoResumeSkipAt: autoResumeSkipNext ? series.nextOccurrenceAt : null,
        },
      });

      if (series.currentAssignmentId) {
        await addHistoryEvent(
          {
            familyId: series.familyId,
            userId: series.userId,
            userName: childName,
            title: series.bounty.title,
            emoji: series.bounty.emoji || "🧹",
            action: "TASK_RECURRING_PAUSED",
            assignerName: parentName,
            metadata: buildTaskLifecycleMetadata({
              bountyAssignmentId: series.currentAssignmentId,
              bountyId: series.bountyId,
              linkedAction: "TASK_RECURRING_PAUSED",
            }),
          },
          tx
        );
      }

      await addNotification(
        {
          userId: series.userId,
          message: `${parentName} paused recurring task "${series.bounty.title}".`,
        },
        tx
      );

      return pausedSeries;
    });

    try {
      await sendPushToUser(series.userId, {
        title: "Recurring task paused",
        body: `${parentName} paused: ${series.bounty.title}`,
        tag: "task-recurring-paused",
        type: "TASK_RECURRING_PAUSED",
        familyId: series.familyId,
        assignmentId: series.currentAssignmentId ?? undefined,
        url: "/?view=wallet&walletTab=tasks",
      });
    } catch (pushErr) {
      console.warn("pauseBountySeries push failed:", pushErr);
    }

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: series.familyId,
      reason: "TASK_RECURRING_PAUSED",
      timestamp: Date.now(),
    };
    broadcastToFamily(series.familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("pauseBountySeries error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// PUT /bounty-series/:seriesId/resume
export const resumeBountySeries = async (req: Request, res: Response) => {
  const seriesId = req.params.seriesId || req.params.id;
  if (!seriesId) {
    return res.status(400).json({ error: "MISSING_SERIES_ID" });
  }

  try {
    const series = await prisma.bountyRecurrenceSeries.findUnique({
      where: { id: seriesId },
      include: {
        bounty: true,
        user: true,
      },
    });

    if (!series) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const parent = await assertFamilyMember(req, series.familyId);
    assertParent(parent);

    if (!series.active) {
      return res.status(400).json({ error: "SERIES_INACTIVE" });
    }

    if (!series.pausedAt) {
      return res.json(series);
    }

    const now = new Date();
    const pauseDurationMs = now.getTime() - series.pausedAt.getTime();
    const shiftedNextOccurrenceAt = new Date(
      series.nextOccurrenceAt.getTime() + Math.max(0, pauseDurationMs)
    );

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = series.user.displayName || series.user.username || "Child";

    const updated = await prisma.$transaction(async (tx) => {
      const resumedSeries = await tx.bountyRecurrenceSeries.update({
        where: { id: seriesId },
        data: {
          pausedAt: null,
          autoResumeSkipAt: null,
          nextOccurrenceAt: shiftedNextOccurrenceAt,
        },
      });

      if (series.currentAssignmentId) {
        await addHistoryEvent(
          {
            familyId: series.familyId,
            userId: series.userId,
            userName: childName,
            title: series.bounty.title,
            emoji: series.bounty.emoji || "🧹",
            action: "TASK_RECURRING_RESUMED",
            assignerName: parentName,
            metadata: buildTaskLifecycleMetadata({
              bountyAssignmentId: series.currentAssignmentId,
              bountyId: series.bountyId,
              linkedAction: "TASK_RECURRING_RESUMED",
            }),
          },
          tx
        );
      }

      await addNotification(
        {
          userId: series.userId,
          message: `${parentName} resumed recurring task "${series.bounty.title}".`,
        },
        tx
      );

      return resumedSeries;
    });

    try {
      await sendPushToUser(series.userId, {
        title: "Recurring task resumed",
        body: `${parentName} resumed: ${series.bounty.title}`,
        tag: "task-recurring-resumed",
        type: "TASK_RECURRING_RESUMED",
        familyId: series.familyId,
        assignmentId: series.currentAssignmentId ?? undefined,
        url: "/?view=wallet&walletTab=tasks",
      });
    } catch (pushErr) {
      console.warn("resumeBountySeries push failed:", pushErr);
    }

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: series.familyId,
      reason: "TASK_RECURRING_RESUMED",
      timestamp: Date.now(),
    };
    broadcastToFamily(series.familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("resumeBountySeries error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// PUT /bounty-series/:seriesId/stop
export const stopBountySeries = async (req: Request, res: Response) => {
  const seriesId = req.params.seriesId || req.params.id;
  if (!seriesId) {
    return res.status(400).json({ error: "MISSING_SERIES_ID" });
  }

  try {
    const series = await prisma.bountyRecurrenceSeries.findUnique({
      where: { id: seriesId },
      include: {
        bounty: true,
        user: true,
      },
    });

    if (!series) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const parent = await assertFamilyMember(req, series.familyId);
    assertParent(parent);

    if (!series.active) {
      return res.status(400).json({ error: "SERIES_INACTIVE" });
    }

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = series.user.displayName || series.user.username || "Child";

    const updated = await prisma.$transaction(async (tx) => {
      if (series.currentAssignmentId) {
        await tx.bountyAssignment.deleteMany({
          where: { id: series.currentAssignmentId },
        });
      }

      const stoppedSeries = await tx.bountyRecurrenceSeries.update({
        where: { id: series.id },
        data: {
          active: false,
          pausedAt: null,
          autoResumeSkipAt: null,
          currentStreak: 0,
          streakGeneration: { increment: 1 },
          currentAssignmentId: null,
        },
      });

      if (series.currentAssignmentId) {
        await addHistoryEvent(
          {
            familyId: series.familyId,
            userId: series.userId,
            userName: childName,
            title: series.bounty.title,
            emoji: series.bounty.emoji || "🧹",
            action: "TASK_RECURRING_STOPPED",
            assignerName: parentName,
            metadata: buildTaskLifecycleMetadata({
              bountyAssignmentId: series.currentAssignmentId,
              bountyId: series.bountyId,
              linkedAction: "TASK_RECURRING_STOPPED",
            }),
          },
          tx
        );
      }

      await addNotification(
        {
          userId: series.userId,
          message: `${parentName} stopped recurring task "${series.bounty.title}".`,
        },
        tx
      );

      return stoppedSeries;
    });

    try {
      await sendPushToUser(series.userId, {
        title: "Recurring task stopped",
        body: `${parentName} stopped: ${series.bounty.title}`,
        tag: "task-recurring-stopped",
        type: "TASK_RECURRING_STOPPED",
        familyId: series.familyId,
        assignmentId: series.currentAssignmentId ?? undefined,
        url: "/?view=wallet&walletTab=tasks",
      });
    } catch (pushErr) {
      console.warn("stopBountySeries push failed:", pushErr);
    }

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: series.familyId,
      reason: "TASK_RECURRING_STOPPED",
      timestamp: Date.now(),
    };
    broadcastToFamily(series.familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("stopBountySeries error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};


// DELETE /bounty-assignments/:id
export const deleteAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.bountyAssignment.findUnique({
      where: { id },
      include: {
        bounty: true,
        user: true,
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, assignment.familyId);
    const familyId = assignment.familyId;
    const bounty = assignment.bounty;
    const child = assignment.user;
    
    // PARENTS: can always delete any assignment
    if (user.role === Role.PARENT) {
      await prisma.bountyAssignment.delete({ where: { id } });
      if (assignment.recurrenceSeriesId) {
        await prisma.bountyRecurrenceSeries.update({
          where: { id: assignment.recurrenceSeriesId },
          data: {
            active: false,
            pausedAt: null,
            autoResumeSkipAt: null,
            currentStreak: 0,
            streakGeneration: { increment: 1 },
            currentAssignmentId: null,
          },
        });
      }
      return res.status(204).send();
    }

    // CHILD: can delete only their own assignment while it's OFFERED or DENIED
    if (
      user.role === Role.CHILD &&
      user.id === assignment.userId &&
      (assignment.status === BountyStatus.OFFERED || assignment.status === BountyStatus.DENIED)
    ) {
      const wasDenied = assignment.status === BountyStatus.DENIED;
      const wasOffered = assignment.status === BountyStatus.OFFERED;
      
      await prisma.bountyAssignment.delete({ where: { id } });
      if (assignment.recurrenceSeriesId) {
        await prisma.bountyRecurrenceSeries.update({
          where: { id: assignment.recurrenceSeriesId },
          data: {
            pausedAt: null,
            autoResumeSkipAt: null,
            active: true,
            currentStreak: 0,
            streakGeneration: { increment: 1 },
            currentAssignmentId: null,
          },
        });
      }
      
      // Notify parents when child rejects any task (OFFERED or DENIED)
      if ((wasDenied || wasOffered) && bounty && child) {
        const childName = child.displayName || child.username || "Child";
        const message = wasDenied 
          ? `${childName} rejected the denied task "${bounty.title}"`
          : `${childName} refused the task "${bounty.title}"`;
        
        const action = wasDenied ? "TASK_REJECTED_AFTER_DENIAL" : "TASK_REFUSED";
        
        // Add history event
        await addHistoryEvent({
          familyId,
          userId: user.id,
          userName: childName,
          title: bounty.title,
          emoji: bounty.emoji,
          action,
          assignerName: childName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: assignment.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: action,
          }),
        });

        // Notify all parents in the family
        const parents = await prisma.user.findMany({
          where: { familyId, role: Role.PARENT },
        });

        for (const parent of parents) {
          await addNotification({
            userId: parent.id,
            message,
          });

          await sendPushToUser(parent.id, {
            title: wasDenied ? "Task Rejected" : "Task Refused",
            body: message,
            icon: bounty.emoji,
          });
        }
      }
      
      const event: SseEvent = {
        type: "WALLET_UPDATE",
        familyId,
        reason: "TASK_REJECTED",
        timestamp: Date.now(),
      };

      broadcastToFamily(familyId, event);
      
      return res.status(204).send();
    }

    // Everyone else: forbidden
    return res.status(403).json({ error: "FORBIDDEN" });

  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("deleteAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

