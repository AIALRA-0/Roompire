import { z } from "zod";

export type PageInfo = {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type PaginatedResult<T> = {
  items: T[];
  page: PageInfo;
};

const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export function paginationQueryFields(defaultLimit: number, maxLimit = 100) {
  return {
    cursor: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    limit: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    ),
  };
}

export function paginateRows<T extends { id: string }>(
  rows: T[],
  limit: number,
): PaginatedResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;

  return {
    items,
    page: {
      limit,
      nextCursor,
      hasMore,
    },
  };
}
