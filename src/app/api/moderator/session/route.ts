import { NextResponse, type NextRequest } from "next/server";

import { MODERATOR_COOKIE, moderatorFor } from "@/lib/auth";

// Relative Location: behind a proxy or in a container, req.url carries the bind address
// (0.0.0.0:3000), not the public host, so an absolute redirect would send people nowhere.
function redirect(location: string) {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

/** Sign-in form posts here: sets an httpOnly session cookie holding the token. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  if (!moderatorFor(token)) return redirect("/moderate?error=1");

  const res = redirect("/moderate");
  const https = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  res.cookies.set(MODERATOR_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: https, path: "/", maxAge: 60 * 60 * 8 });
  return res;
}

export async function DELETE() {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(MODERATOR_COOKIE);
  return res;
}
