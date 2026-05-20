import { NextResponse } from "next/server";
import { completeGoogleCalendarConnection } from "@/lib/google-calendar";
import { getCurrentUser, syncAppUser } from "@/lib/auth/session";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  await syncAppUser(user);

  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  const oauthDescription = url.searchParams.get("error_description");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (oauthError) {
    const next = new URL("/app/calendar", request.url);
    next.searchParams.set("google", "error");
    next.searchParams.set("message", oauthDescription || oauthError);
    return NextResponse.redirect(next);
  }

  if (!code || !state) {
    const next = new URL("/app/calendar", request.url);
    next.searchParams.set("google", "missing");
    next.searchParams.set("message", "google did not return a code and state.");
    return NextResponse.redirect(next);
  }

  const result = await completeGoogleCalendarConnection(code, state, user.id);
  const next = new URL("/app/calendar", request.url);
  next.searchParams.set("google", result.type);
  if (result.type === "error") {
    next.searchParams.set("message", result.message);
  }

  return NextResponse.redirect(next);
}
