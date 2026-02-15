import { Role, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

export type DeletionMode =
  | "single_user_delete"
  | "family_teardown_last_user"
  | "family_teardown_no_parents_remaining";

export type DeletionActor = {
  source: "APP_USER" | "SELF_HOSTER_API" | "SELF_HOSTER_CLI";
  actorUserId?: string;
  actorLabel?: string;
};

export type DeletionCounts = {
  pushSubscriptions: number;
  notifications: number;
  historyEvents: number;
  bountyAssignments: number;
  assignedPrizes: number;
  claims: number;
  storeItems: number;
  wheelSegments: number;
  bounties: number;
  rewards: number;
  users: number;
  families: number;
};

export type DeleteUserResult = {
  mode: DeletionMode;
  deletedUserId: string;
  deletedFamilyId?: string;
  counts: DeletionCounts;
};

export type DeleteFamilyResult = {
  mode: "family_teardown_forced";
  deletedFamilyId: string;
  counts: DeletionCounts;
};

export type FamilySummary = {
  id: string;
  name: string;
  createdAt: Date;
  parentCount: number;
  childCount: number;
  userCount: number;
};

export type UserSummary = {
  id: string;
  familyId: string;
  username: string;
  displayName: string;
  role: Role;
  createdAt: Date;
};

export class AccountDeletionError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

const emptyCounts = (): DeletionCounts => ({
  pushSubscriptions: 0,
  notifications: 0,
  historyEvents: 0,
  bountyAssignments: 0,
  assignedPrizes: 0,
  claims: 0,
  storeItems: 0,
  wheelSegments: 0,
  bounties: 0,
  rewards: 0,
  users: 0,
  families: 0,
});

async function deleteFamilyCascadeWithClient(
  client: PrismaClientOrTx,
  familyId: string
): Promise<DeletionCounts> {
  const counts = emptyCounts();

  const [users, rewards] = await Promise.all([
    client.user.findMany({
      where: { familyId },
      select: { id: true },
    }),
    client.reward.findMany({
      where: { familyId },
      select: { id: true },
    }),
  ]);

  const userIds = users.map((u) => u.id);
  const rewardIds = rewards.map((r) => r.id);

  if (userIds.length > 0) {
    counts.pushSubscriptions = (
      await client.pushSubscription.deleteMany({
        where: { userId: { in: userIds } },
      })
    ).count;

    counts.notifications = (
      await client.notification.deleteMany({
        where: { userId: { in: userIds } },
      })
    ).count;
  }

  counts.historyEvents = (
    await client.historyEvent.deleteMany({
      where: { familyId },
    })
  ).count;

  counts.bountyAssignments = (
    await client.bountyAssignment.deleteMany({
      where: { familyId },
    })
  ).count;

  counts.assignedPrizes = (
    await client.assignedPrize.deleteMany({
      where: { familyId },
    })
  ).count;

  const claimFilters: Prisma.ClaimWhereInput[] = [];
  if (userIds.length > 0) {
    claimFilters.push({ userId: { in: userIds } });
  }
  if (rewardIds.length > 0) {
    claimFilters.push({ rewardId: { in: rewardIds } });
  }
  if (claimFilters.length > 0) {
    counts.claims = (
      await client.claim.deleteMany({
        where: { OR: claimFilters },
      })
    ).count;
  }

  counts.storeItems = (
    await client.storeItem.deleteMany({
      where: { familyId },
    })
  ).count;

  counts.wheelSegments = (
    await client.wheelSegment.deleteMany({
      where: { familyId },
    })
  ).count;

  counts.bounties = (
    await client.bounty.deleteMany({
      where: { familyId },
    })
  ).count;

  counts.rewards = (
    await client.reward.deleteMany({
      where: { familyId },
    })
  ).count;

  counts.users = (
    await client.user.deleteMany({
      where: { familyId },
    })
  ).count;

  await client.family.delete({
    where: { id: familyId },
  });
  counts.families = 1;

  return counts;
}

async function deleteSingleUserWithClient(
  client: PrismaClientOrTx,
  userId: string
): Promise<DeletionCounts> {
  const counts = emptyCounts();

  counts.pushSubscriptions = (
    await client.pushSubscription.deleteMany({
      where: { userId },
    })
  ).count;

  counts.notifications = (
    await client.notification.deleteMany({
      where: { userId },
    })
  ).count;

  counts.historyEvents = (
    await client.historyEvent.deleteMany({
      where: { userId },
    })
  ).count;

  counts.bountyAssignments = (
    await client.bountyAssignment.deleteMany({
      where: { userId },
    })
  ).count;

  counts.assignedPrizes = (
    await client.assignedPrize.deleteMany({
      where: { userId },
    })
  ).count;

  counts.claims = (
    await client.claim.deleteMany({
      where: { userId },
    })
  ).count;

  await client.user.delete({
    where: { id: userId },
  });
  counts.users = 1;

  return counts;
}

export async function deleteUserWithRules(
  targetUserId: string,
  _actor: DeletionActor
): Promise<DeleteUserResult> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        familyId: true,
        role: true,
      },
    });

    if (!target) {
      throw new AccountDeletionError(404, "NOT_FOUND");
    }

    const [userCount, parentCount] = await Promise.all([
      tx.user.count({ where: { familyId: target.familyId } }),
      tx.user.count({
        where: { familyId: target.familyId, role: Role.PARENT },
      }),
    ]);

    let mode: DeletionMode = "single_user_delete";
    if (userCount <= 1) {
      mode = "family_teardown_last_user";
    } else if (target.role === Role.PARENT && parentCount <= 1) {
      mode = "family_teardown_no_parents_remaining";
    }

    if (mode === "single_user_delete") {
      const counts = await deleteSingleUserWithClient(tx, target.id);
      return {
        mode,
        deletedUserId: target.id,
        counts,
      };
    }

    const counts = await deleteFamilyCascadeWithClient(tx, target.familyId);
    return {
      mode,
      deletedUserId: target.id,
      deletedFamilyId: target.familyId,
      counts,
    };
  });
}

export async function deleteFamilyCascade(
  familyId: string,
  _actor: DeletionActor
): Promise<DeleteFamilyResult> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { id: true },
  });

  if (!family) {
    throw new AccountDeletionError(404, "FAMILY_NOT_FOUND");
  }

  const counts = await prisma.$transaction((tx) =>
    deleteFamilyCascadeWithClient(tx, familyId)
  );

  return {
    mode: "family_teardown_forced",
    deletedFamilyId: familyId,
    counts,
  };
}

export async function listFamiliesSummary(): Promise<FamilySummary[]> {
  const [families, groupedRoles] = await Promise.all([
    prisma.family.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.groupBy({
      by: ["familyId", "role"],
      _count: {
        _all: true,
      },
    }),
  ]);

  const countsByFamily = new Map<
    string,
    { parentCount: number; childCount: number }
  >();

  for (const row of groupedRoles) {
    const existing = countsByFamily.get(row.familyId) ?? {
      parentCount: 0,
      childCount: 0,
    };

    if (row.role === Role.PARENT) {
      existing.parentCount = row._count._all;
    } else {
      existing.childCount = row._count._all;
    }

    countsByFamily.set(row.familyId, existing);
  }

  return families.map((family) => {
    const roleCounts = countsByFamily.get(family.id) ?? {
      parentCount: 0,
      childCount: 0,
    };
    return {
      id: family.id,
      name: family.name,
      createdAt: family.createdAt,
      parentCount: roleCounts.parentCount,
      childCount: roleCounts.childCount,
      userCount: roleCounts.parentCount + roleCounts.childCount,
    };
  });
}

export async function listUsersSummary(familyId?: string): Promise<UserSummary[]> {
  return prisma.user.findMany({
    where: familyId ? { familyId } : undefined,
    select: {
      id: true,
      familyId: true,
      username: true,
      displayName: true,
      role: true,
      createdAt: true,
    },
    orderBy: [{ familyId: "asc" }, { createdAt: "asc" }],
  });
}
