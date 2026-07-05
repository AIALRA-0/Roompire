import { prisma } from "../apps/web/src/server/db/prisma";
import { sendReminderNotifications } from "../apps/web/src/server/notifications/service";

type CliOptions = {
  now?: Date;
  taskLookaheadHours?: number;
  debtLookaheadDays?: number;
  settlementConfirmationHours?: number;
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
    } else if (arg.startsWith("--task-lookahead-hours=")) {
      options.taskLookaheadHours = readNumber(
        arg.slice("--task-lookahead-hours=".length),
        "--task-lookahead-hours",
      );
    } else if (arg.startsWith("--debt-lookahead-days=")) {
      options.debtLookaheadDays = readNumber(
        arg.slice("--debt-lookahead-days=".length),
        "--debt-lookahead-days",
      );
    } else if (arg.startsWith("--settlement-confirmation-hours=")) {
      options.settlementConfirmationHours = readNumber(
        arg.slice("--settlement-confirmation-hours=".length),
        "--settlement-confirmation-hours",
      );
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
  const summary = await sendReminderNotifications({
    taskLookaheadHours: Number(process.env.ROOMPIRE_TASK_REMINDER_LOOKAHEAD_HOURS) || undefined,
    debtLookaheadDays: Number(process.env.ROOMPIRE_DEBT_REMINDER_LOOKAHEAD_DAYS) || undefined,
    settlementConfirmationHours:
      Number(process.env.ROOMPIRE_SETTLEMENT_REMINDER_CONFIRMATION_HOURS) || undefined,
    maxItems: Number(process.env.ROOMPIRE_REMINDER_MAX_ITEMS) || undefined,
    ...options,
  });

  console.log(`ok reminders ${JSON.stringify(summary)}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
