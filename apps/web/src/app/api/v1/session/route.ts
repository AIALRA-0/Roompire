import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    user: {
      email: process.env.ROOMPIRE_DEV_SESSION_EMAIL ?? "alice@example.test",
      displayName: "Alice",
      preferredLocale: "en-US",
    },
    household: {
      name: "USC 3B2B",
      role: "OWNER",
      settlementCurrency: "CNY",
      fxPolicy: "LOCK_AT_EXPENSE_DATE",
    },
  });
}
