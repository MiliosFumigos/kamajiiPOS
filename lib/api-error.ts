import { NextResponse } from "next/server";

type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown
) {
  const payload: ApiErrorPayload = details
    ? { code, message, details }
    : { code, message };
  return NextResponse.json(payload, { status });
}
