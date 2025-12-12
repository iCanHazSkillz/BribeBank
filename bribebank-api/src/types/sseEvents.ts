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
    }
  | {
      type: "TICKETS_GIVEN";
      familyId: string;
      userId: string;
      amount: number;
      newBalance: number;
      timestamp: number;
    }
  | {
      type: "STORE_ITEM_ADDED";
      familyId: string;
      itemId: string;
      timestamp: number;
    }
  | {
      type: "STORE_ITEM_UPDATED";
      familyId: string;
      itemId: string;
      timestamp: number;
    }
  | {
      type: "STORE_ITEM_DELETED";
      familyId: string;
      itemId: string;
      timestamp: number;
    }
  | {
      type: "STORE_PURCHASE";
      familyId: string;
      userId: string;
      itemId: string;
      assignmentId: string;
      newBalance: number;
      timestamp: number;
    };