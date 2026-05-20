import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in." }, { status: 401 });
  }

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "cartesia is not configured." }, { status: 503 });
  }

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "audio file is required." }, { status: 400 });
  }

  const body = new FormData();
  body.set("file", file);
  body.set("model", process.env.CARTESIA_STT_MODEL ?? "ink-whisper");
  body.set("language", "en");

  const response = await fetch("https://api.cartesia.ai/stt", {
    method: "POST",
    headers: {
      "Cartesia-Version": process.env.CARTESIA_VERSION ?? "2026-03-01",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return NextResponse.json(
      { error: text.slice(0, 400) || "transcription failed." },
      { status: 502 },
    );
  }

  return NextResponse.json(await response.json());
}
