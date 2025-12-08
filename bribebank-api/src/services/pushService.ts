import webpush from "web-push";
import { prisma } from "../lib/prisma.js";

const subject = process.env.VAPID_SUBJECT || "mailto:noreply@example.com";
const publicKeyEnv = process.env.VAPID_PUBLIC_KEY;
const privateKeyEnv = process.env.VAPID_PRIVATE_KEY;

const hasVapid = typeof publicKeyEnv === "string" && typeof privateKeyEnv === "string";

if (!hasVapid) {
  console.warn("[pushService] VAPID keys not configured – web push disabled");
} else {
  // TS now knows these are strings in this branch
  webpush.setVapidDetails(subject, publicKeyEnv, privateKeyEnv);
}

export type PushPayload = {
  title: string;
  body: string;
  /**
   * Optional deep-link URL the notification should open.
   * Can be absolute ("https://...") or relative ("/admin").
   */
  url?: string;
  tag?: string;
  type?: string;
  familyId?: string;
  [key: string]: any;
};

// Note: we keep the env values around only for truthiness checks
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!hasVapid) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (!subs.length) return;

  // Default URL if caller doesn't provide one
  const defaultUrl = "https://bribebank.homeflixlab.com/";

  const finalPayload: PushPayload = {
    url: payload.url ?? defaultUrl,
    ...payload,
  };

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify(finalPayload)
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          console.warn(
            "[pushService] removing stale subscription",
            sub.id,
            err?.statusCode
          );
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        } else {
          console.error("[pushService] send error", err);
        }
      }
    })
  );
}
