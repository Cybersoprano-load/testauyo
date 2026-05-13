import { clearRefreshCookie } from "@/lib/cookies";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = json({ message: "Logged out" });
  clearRefreshCookie(res);
  return res;
}
