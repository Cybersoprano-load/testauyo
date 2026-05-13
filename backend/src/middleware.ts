import { NextResponse, type NextRequest } from "next/server";
import { applyCors, preflight } from "./lib/cors";

export function middleware(req: NextRequest) {
  const pre = preflight(req);
  if (pre) return pre;
  return applyCors(req, NextResponse.next());
}

export const config = {
  matcher: ["/api/:path*"],
};
