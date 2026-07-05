import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import {
  createExpenseTagForHousehold,
  listExpenseTagsForHousehold,
} from "@/server/expenses/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

type ExpenseTagForResponse = Awaited<ReturnType<typeof listExpenseTagsForHousehold>>[number];

function serializeExpenseTag(tag: ExpenseTagForResponse) {
  return {
    id: tag.id,
    name: tag.name,
    colorToken: tag.colorToken,
    sortOrder: tag.sortOrder,
    isActive: tag.isActive,
  };
}

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Expense tag input is invalid.");
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const tags = await listExpenseTagsForHousehold(user.id, householdId);

    return NextResponse.json({
      tags: tags.map(serializeExpenseTag),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const body = await readJsonBody(request);
    const tag = await createExpenseTagForHousehold(user.id, householdId, body);

    return NextResponse.json(
      {
        tag: serializeExpenseTag(tag),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
