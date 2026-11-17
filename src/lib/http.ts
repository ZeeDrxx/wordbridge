import { NextResponse, type NextRequest } from "next/server";

import { MODERATOR_COOKIE, moderatorFor } from "./auth";
import { ModerationError } from "./moderation";

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}

export function problem(status: number, error: string, fields?: Record<string, string>) {
  return NextResponse.json({ error, ...(fields ? { fields } : {}) }, { status });
}

/** Moderator from `Authorization: Bearer <token>` (API clients) or the session cookie (browser). */
export function moderatorOf(req: NextRequest): string | null {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return moderatorFor(bearer ?? req.cookies.get(MODERATOR_COOKIE)?.value);
}

export function fail(err: unknown) {
  if (err instanceof ModerationError) return problem(err.status, err.message);
  console.error(err);
  return problem(500, "internal error");
}

// Tiny fixed-window rate limiter, per server instance. Enough to slow down form spam; a
// multi-instance deployment would move this to a shared store.
const windows = new Map<string, { start: number; count: number }>();
export function rateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || now - w.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    return false;
  }
  w.count += 1;
  return w.count > limit;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
