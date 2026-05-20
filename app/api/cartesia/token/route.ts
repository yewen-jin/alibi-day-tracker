import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in." }, { status: 401 });
  }

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "cartesia is not configured." }, { status: 503 });
  }

  const response = await fetch("https://api.cartesia.ai/access-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cartesia-Version": process.env.CARTESIA_VERSION ?? "2026-03-01",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      grants: { stt: true, tts: true },
      expires_in: 300,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "could not mint cartesia token." }, { status: 502 });
  }

  return NextResponse.json(await response.json());
}
