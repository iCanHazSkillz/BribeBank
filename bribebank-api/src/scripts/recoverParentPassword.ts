import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { rotateFamilyRecoveryKey } from "../services/recoveryService.js";
import { addHistoryEvent } from "../services/historyService.js";

type CliArgs = {
  username?: string;
  newPassword?: string;
  forceRotateKey: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { forceRotateKey: true };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--username" && next) {
      args.username = next;
      i += 1;
      continue;
    }

    if (arg === "--new-password" && next) {
      args.newPassword = next;
      i += 1;
      continue;
    }

    if (arg === "--force-rotate-key" && next) {
      args.forceRotateKey = next !== "false";
      i += 1;
    }
  }

  return args;
}

function usage() {
  console.error(
    "Usage: npx tsx src/scripts/recoverParentPassword.ts --username <parentUsername> --new-password \"<password>\" [--force-rotate-key true|false]"
  );
}

async function run() {
  const { username, newPassword, forceRotateKey } = parseArgs(process.argv.slice(2));
  if (!username || !newPassword) {
    usage();
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error("ERROR: new password must be at least 8 characters.");
    process.exit(1);
  }

  const normalizedUsername = username.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username: normalizedUsername },
    select: {
      id: true,
      familyId: true,
      role: true,
      displayName: true,
    },
  });

  if (!user) {
    console.error("ERROR: user not found.");
    process.exit(1);
  }
  if (user.role !== Role.PARENT) {
    console.error("ERROR: target user is not a parent account.");
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      sessionVersion: { increment: 1 },
    },
  });

  let newRecoveryKey: string | null = null;
  let rotatedAt: Date | null = null;
  if (forceRotateKey) {
    const rotated = await rotateFamilyRecoveryKey(user.familyId);
    newRecoveryKey = rotated.recoveryKey;
    rotatedAt = rotated.updatedAt;
  }

  await addHistoryEvent({
    familyId: user.familyId,
    userId: user.id,
    userName: user.displayName,
    title: "Password recovery by self-hoster",
    emoji: "🛠️",
    action: "MASTER_PASSWORD_RECOVERY",
    assignerName: "SELF_HOSTER_CLI",
    metadata: JSON.stringify({
      actor: "SELF_HOSTER_CLI",
      targetUsername: normalizedUsername,
      timestamp: new Date().toISOString(),
      recoveryKeyRotated: forceRotateKey,
    }),
  });

  console.log(
    JSON.stringify({
      event: "MASTER_PASSWORD_RECOVERY",
      status: "success",
      username: normalizedUsername,
      familyId: user.familyId,
      recoveryKeyRotated: forceRotateKey,
      rotatedAt: rotatedAt?.toISOString() || null,
    })
  );

  console.log("SUCCESS: Parent password updated.");
  console.log(`User ID: ${user.id}`);
  console.log(`Family ID: ${user.familyId}`);
  if (newRecoveryKey) {
    console.log("New family recovery key (shown once):");
    console.log(newRecoveryKey);
    console.log("Store this key securely. It will not be shown again.");
  } else {
    console.log("Recovery key rotation was skipped (--force-rotate-key false).");
  }
}

run()
  .catch((err) => {
    console.error("ERROR: Failed to recover parent password.", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
