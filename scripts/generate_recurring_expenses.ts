import { prisma } from "../apps/web/src/server/db/prisma";
import { generateRecurringExpenseProposals } from "../apps/web/src/server/expenses/recurring";

type CliOptions = {
  now?: Date;
  maxItems?: number;
  dryRun?: boolean;
};

function readNumber(value: string, flag: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number.`);
  }

  return parsed;
}

function readDate(value: string, flag: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${flag} must be a valid ISO date-time.`);
  }

  return parsed;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};

  for (const arg of args) {
    if (arg === "--") {
      continue;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--now=")) {
      options.now = readDate(arg.slice("--now=".length), "--now");
    } else if (arg.startsWith("--max-items=")) {
      options.maxItems = readNumber(arg.slice("--max-items=".length), "--max-items");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = await generateRecurringExpenseProposals({
    maxItems: Number(process.env.ROOMPIRE_RECURRING_EXPENSE_MAX_ITEMS) || undefined,
    ...options,
  });

  console.log(`ok recurring-expenses ${JSON.stringify(summary)}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
