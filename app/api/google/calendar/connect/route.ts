import { NextResponse } from "next/server";
import { createGoogleCalendarAuthUrl } from "@/lib/google-calendar";
import { getCurrentUser, syncAppUser } from "@/lib/auth/session";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  await syncAppUser(user);

  const authUrl = createGoogleCalendarAuthUrl(user.id);
  if (!authUrl) {
    const next = new URL("/app/calendar", request.url);
    next.searchParams.set("google", "not_configured");
    return NextResponse.redirect(next);
  }

  return NextResponse.redirect(authUrl);
}
