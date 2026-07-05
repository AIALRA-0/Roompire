import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import {
  archiveExpenseTagForHousehold,
  listExpenseTagsForHousehold,
  updateExpenseTagForHousehold,
} from "@/server/expenses/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; tagId: string }>;
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, tagId } = await context.params;
    const body = await readJsonBody(request);
    const tag = await updateExpenseTagForHousehold(user.id, householdId, tagId, body);

    return NextResponse.json({
      tag: serializeExpenseTag(tag),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, tagId } = await context.params;
    const tag = await archiveExpenseTagForHousehold(user.id, householdId, tagId);

    return NextResponse.json({
      tag: serializeExpenseTag(tag),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
