import { listFamiliesSummary, listUsersSummary } from "../services/accountDeletionService.js";
import { prisma } from "../lib/prisma.js";

type CliArgs = {
  families: boolean;
  users: boolean;
  familyId?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { families: false, users: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--families") {
      args.families = true;
      continue;
    }
    if (arg === "--users") {
      args.users = true;
      continue;
    }
    if (arg === "--family-id" && next) {
      args.familyId = next;
      i += 1;
      continue;
    }
  }

  return args;
}

function usage() {
  console.error(
    "Usage: npm run host:list -- --families | --users [--family-id <familyId>]"
  );
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if ((args.families && args.users) || (!args.families && !args.users)) {
    usage();
    process.exit(1);
  }

  if (args.families) {
    const families = await listFamiliesSummary();
    console.log(
      JSON.stringify({
        type: "families",
        count: families.length,
        items: families,
      })
    );
    return;
  }

  const users = await listUsersSummary(args.familyId);
  console.log(
    JSON.stringify({
      type: "users",
      familyId: args.familyId ?? null,
      count: users.length,
      items: users,
    })
  );
}

run()
  .catch((err) => {
    console.error("ERROR: selfHosterList failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
