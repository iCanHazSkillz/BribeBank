import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "./pushService.js";

/**
 * Deadline Monitor Service
 * Checks for tasks approaching their deadline (< 1 hour) and sends push notifications
 */

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function checkApproachingDeadlines(): Promise<void> {
  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + ONE_HOUR_MS);

    // Find IN_PROGRESS assignments with deadlines approaching in the next hour
    // that haven't been notified yet
    const approachingDeadlines = await prisma.bountyAssignment.findMany({
      where: {
        status: "IN_PROGRESS",
        deadlineExpiresAt: {
          not: null,
          lte: oneHourFromNow,
          gt: now, // Still has time remaining (not overdue yet)
        },
        deadlineWarningNotified: false,
      },
      include: {
        bounty: true,
        user: true,
      },
    });

    if (approachingDeadlines.length === 0) {
      console.log("[deadlineMonitor] No approaching deadlines found");
      return;
    }

    console.log(
      `[deadlineMonitor] Found ${approachingDeadlines.length} task(s) with approaching deadlines`
    );

    // Send notifications and mark as notified
    for (const assignment of approachingDeadlines) {
      try {
        const timeRemaining = assignment.deadlineExpiresAt!.getTime() - now.getTime();
        const minutesRemaining = Math.floor(timeRemaining / (60 * 1000));

        await sendPushToUser(assignment.userId, {
          title: `⏰ Deadline Alert: ${assignment.bounty.title}`,
          body: `Hurry! Only ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''} left to complete this task!`,
          type: "DEADLINE_WARNING",
          tag: `deadline-${assignment.id}`,
          url: "/", // Opens wallet view
        });

        // Mark as notified
        await prisma.bountyAssignment.update({
          where: { id: assignment.id },
          data: { deadlineWarningNotified: true },
        });

        console.log(
          `[deadlineMonitor] Sent deadline warning to ${assignment.user.displayName} for task: ${assignment.bounty.title}`
        );
      } catch (error) {
        console.error(
          `[deadlineMonitor] Error processing assignment ${assignment.id}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error("[deadlineMonitor] Error checking deadlines:", error);
  }
}

/**
 * Start the deadline monitoring service
 * Runs every 15 minutes to check for approaching deadlines
 */
export function startDeadlineMonitoring(): void {
  const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  console.log("[deadlineMonitor] Starting deadline monitoring service");
  
  // Run immediately on startup
  checkApproachingDeadlines();

  // Then run every 15 minutes
  setInterval(() => {
    checkApproachingDeadlines();
  }, CHECK_INTERVAL_MS);
}
