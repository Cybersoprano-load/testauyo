import { NextResponse, type NextRequest } from "next/server";
import { env } from "./env";

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  return env.corsOrigins.includes(origin);
}

export function applyCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get("origin");
  if (isAllowedOrigin(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export function preflight(req: NextRequest): NextResponse | null {
  if (req.method !== "OPTIONS") return null;
  const res = new NextResponse(null, { status: 204 });
  const origin = req.headers.get("origin");
  if (isAllowedOrigin(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
    res.headers.set(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,OPTIONS"
    );
    res.headers.set(
      "Access-Control-Allow-Headers",
      req.headers.get("access-control-request-headers") ??
        "Authorization,Content-Type"
    );
    res.headers.set("Access-Control-Max-Age", "600");
  }
  return res;
}
