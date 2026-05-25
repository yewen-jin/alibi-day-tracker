import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    text?: string;
    mode?: string;
  } | null;
  const mode = body?.mode === "demo" ? "demo" : "authenticated";
  const user = await getCurrentUser();
  if (!user && mode !== "demo") {
    return NextResponse.json({ error: "not signed in." }, { status: 401 });
  }

  const apiKey = process.env.CARTESIA_API_KEY;
  const voiceId = process.env.CARTESIA_DEFAULT_VOICE_ID;
  if (!apiKey || !voiceId) {
    return NextResponse.json({ error: "cartesia voice is not configured." }, { status: 503 });
  }

  const text = body?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cartesia-Version": process.env.CARTESIA_VERSION ?? "2026-03-01",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model_id: process.env.CARTESIA_TTS_MODEL ?? "sonic-3.5",
      transcript: text.slice(0, 1000),
      voice: { mode: "id", id: voiceId },
      output_format: {
        container: "wav",
        encoding: "pcm_f32le",
        sample_rate: 44100,
      },
      language: "en",
      save: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "");
    return NextResponse.json(
      { error: error.slice(0, 400) || "speech generation failed." },
      { status: 502 },
    );
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}
