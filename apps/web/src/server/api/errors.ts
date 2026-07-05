import { NextResponse } from "next/server";

export type ErrorDetails = Record<string, unknown>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ErrorDetails;
  readonly headers?: HeadersInit;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ErrorDetails,
    headers?: HeadersInit,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { headers: error.headers, status: error.status },
    );
  }

  console.error(error);

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error",
      },
    },
    { status: 500 },
  );
}

export function validationError(message: string, details?: ErrorDetails) {
  return new ApiError(400, "VALIDATION_ERROR", message, details);
}
