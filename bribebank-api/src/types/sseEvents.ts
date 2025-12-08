// shared SseEvent type (backend + frontend)

export type SseEvent =
  | {
      type: "CONNECTED";
      message: string;
      timestamp: number;
    }
  | {
      type: "CHILD_ACTION";
      familyId: string;
      subtype: "REWARD_CLAIMED" | "TASK_COMPLETED";
      id: string;          // assignment id
      userId: string;      // child id
      timestamp: number;
    }
  | {
      type: "TEMPLATE_UPDATE";
      familyId: string;
      target: "REWARD_TEMPLATE" | "BOUNTY_TEMPLATE";
      action: "CREATED" | "UPDATED" | "DELETED";
      timestamp: number;
    }
  | {
      type: "WALLET_UPDATE";
      familyId: string;
      reason: "REWARD_ASSIGNED" | "REWARD_APPROVED" | "REWARD_REJECTED" | "TASK_ASSIGNED" | "TASK_VERIFIED" | "TASK_REJECTED" | "TASK_ACCEPTED";
      timestamp: number;
    };