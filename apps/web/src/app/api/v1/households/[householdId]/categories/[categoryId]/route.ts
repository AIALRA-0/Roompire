import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import {
  archiveExpenseCategoryForHousehold,
  listExpenseCategoriesForHousehold,
  updateExpenseCategoryForHousehold,
} from "@/server/expenses/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; categoryId: string }>;
};

type ExpenseCategoryForResponse = Awaited<
  ReturnType<typeof listExpenseCategoriesForHousehold>
>[number];

function serializeExpenseCategory(category: ExpenseCategoryForResponse) {
  return {
    id: category.id,
    key: category.key,
    nameEn: category.nameEn,
    nameZhCn: category.nameZhCn,
    icon: category.icon,
    colorToken: category.colorToken,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Expense category input is invalid.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, categoryId } = await context.params;
    const body = await readJsonBody(request);
    const category = await updateExpenseCategoryForHousehold(
      user.id,
      householdId,
      categoryId,
      body,
    );

    return NextResponse.json({
      category: serializeExpenseCategory(category),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, categoryId } = await context.params;
    const category = await archiveExpenseCategoryForHousehold(user.id, householdId, categoryId);

    return NextResponse.json({
      category: serializeExpenseCategory(category),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
