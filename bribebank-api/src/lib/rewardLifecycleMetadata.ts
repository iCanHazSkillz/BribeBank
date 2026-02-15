export type RewardLifecycleOrigin = "STANDARD" | "STORE_PURCHASE";

export type RewardLifecycleMetadata = {
  version: 1;
  lifecycleType: "REWARD";
  rewardAssignmentId: string;
  rewardOrigin: RewardLifecycleOrigin;
  linkedAction?: string;
  ticketCost?: number;
  refundedTickets?: number;
};

export const buildRewardLifecycleMetadata = (
  data: Omit<RewardLifecycleMetadata, "version" | "lifecycleType">
) =>
  JSON.stringify({
    version: 1,
    lifecycleType: "REWARD",
    ...data,
  } satisfies RewardLifecycleMetadata);

export const rewardOriginFromTitle = (
  title: string | null | undefined
): RewardLifecycleOrigin =>
  title?.startsWith("STORE:") ? "STORE_PURCHASE" : "STANDARD";

