import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import {
  createExpenseCategoryForHousehold,
  listExpenseCategoriesForHousehold,
} from "@/server/expenses/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const categories = await listExpenseCategoriesForHousehold(user.id, householdId);

    return NextResponse.json({
      categories: categories.map(serializeExpenseCategory),
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
    const category = await createExpenseCategoryForHousehold(user.id, householdId, body);

    return NextResponse.json(
      {
        category: serializeExpenseCategory(category),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
