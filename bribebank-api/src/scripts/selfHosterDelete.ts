import {
  AccountDeletionError,
  deleteFamilyCascade,
  deleteUserWithRules,
} from "../services/accountDeletionService.js";
import { prisma } from "../lib/prisma.js";

type CliArgs = {
  userId?: string;
  familyId?: string;
  yes: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { yes: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--user-id" && next) {
      args.userId = next;
      i += 1;
      continue;
    }
    if (arg === "--family-id" && next) {
      args.familyId = next;
      i += 1;
      continue;
    }
    if (arg === "--yes") {
      args.yes = true;
    }
  }

  return args;
}

function usage() {
  console.error(
    "Usage: npm run host:delete -- --user-id <id> --yes | --family-id <id> --yes"
  );
}

function auditLog(payload: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      actor: "SELF_HOSTER_CLI",
      timestamp: new Date().toISOString(),
      ...payload,
    })
  );
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.yes) {
    console.error("ERROR: --yes is required for destructive operations.");
    usage();
    process.exit(1);
  }

  const hasUserId = !!args.userId;
  const hasFamilyId = !!args.familyId;
  if ((hasUserId && hasFamilyId) || (!hasUserId && !hasFamilyId)) {
    usage();
    process.exit(1);
  }

  if (args.userId) {
    auditLog({
      event: "SELF_HOSTER_DELETE_USER_START",
      targetUserId: args.userId,
    });

    const result = await deleteUserWithRules(args.userId, {
      source: "SELF_HOSTER_CLI",
      actorLabel: "SELF_HOSTER_CLI",
    });

    auditLog({
      event: "SELF_HOSTER_DELETE_USER_SUCCESS",
      targetUserId: args.userId,
      mode: result.mode,
      deletedFamilyId: result.deletedFamilyId ?? null,
      counts: result.counts,
    });

    console.log(JSON.stringify(result));
    return;
  }

  auditLog({
    event: "SELF_HOSTER_DELETE_FAMILY_START",
    targetFamilyId: args.familyId,
  });

  const result = await deleteFamilyCascade(args.familyId!, {
    source: "SELF_HOSTER_CLI",
    actorLabel: "SELF_HOSTER_CLI",
  });

  auditLog({
    event: "SELF_HOSTER_DELETE_FAMILY_SUCCESS",
    targetFamilyId: args.familyId,
    mode: result.mode,
    counts: result.counts,
  });

  console.log(JSON.stringify(result));
}

run()
  .catch((err) => {
    if (err instanceof AccountDeletionError) {
      console.error(
        JSON.stringify({
          error: err.code,
          status: err.status,
        })
      );
      process.exit(1);
    }
    console.error("ERROR: selfHosterDelete failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
