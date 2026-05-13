import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ detail: err.detail }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return NextResponse.json({ detail: msg }, { status: 422 });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }
  console.error("Unhandled API error:", err);
  return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
}

export function json<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
