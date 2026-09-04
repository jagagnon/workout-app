import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkBearerOrSession } from "./lib/auth";

// `middleware.ts` was renamed to `proxy.ts` in Next 16, and Proxy now defaults to
// the Node.js runtime — which is what lets this import the node:crypto-backed
// checks in lib/auth directly instead of reimplementing them for Edge.
//
// Everything here was previously reachable without credentials: the dashboard,
// /prs and /sessions all render the full training history, so guarding only the
// read APIs would have moved the data behind a door with no walls.
const PUBLIC = [
  "/login", // the passcode form itself
  "/api/auth", // exchanges the passcode for the session cookie
  "/api/mcp", // carries its own ?key= secret; the MCP client sends no cookie
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (checkBearerOrSession(req)) return NextResponse.next();

  // API callers get a status they can act on; browsers get the form.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Without a matcher the proxy also runs on static assets, which would leave
  // the login page unable to load its own CSS.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
