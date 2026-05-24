import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

const CARTESIA_STT_TIMEOUT_MS = 25_000;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in." }, { status: 401 });
  }

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    console.error("[cartesia-stt]", {
      user_id: user.id,
      stage: "config",
      error: "CARTESIA_API_KEY missing",
    });
    return NextResponse.json({ error: "cartesia is not configured." }, { status: 503 });
  }

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) {
    console.error("[cartesia-stt]", {
      user_id: user.id,
      stage: "validate",
      error: "file missing",
    });
    return NextResponse.json({ error: "audio file is required." }, { status: 400 });
  }

  const model = process.env.CARTESIA_STT_MODEL ?? "ink-whisper";
  const version = process.env.CARTESIA_VERSION ?? "2026-03-01";

  const body = new FormData();
  body.set("file", file);
  body.set("model", model);
  body.set("language", "en");

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CARTESIA_STT_TIMEOUT_MS);
  let response: Response;
  const startedAt = Date.now();

  try {
    response = await fetch("https://api.cartesia.ai/stt", {
      method: "POST",
      headers: {
        "Cartesia-Version": version,
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    const aborted = error instanceof DOMException && error.name === "AbortError";
    const message = aborted ? "transcription timed out." : "transcription failed.";
    console.error("[cartesia-stt]", {
      user_id: user.id,
      stage: "fetch",
      aborted,
      elapsed_ms: elapsed,
      file_size: file.size,
      file_type: file.type || null,
      model,
      version,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  const elapsed = Date.now() - startedAt;

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[cartesia-stt]", {
      user_id: user.id,
      stage: "upstream_error",
      status: response.status,
      elapsed_ms: elapsed,
      file_size: file.size,
      file_type: file.type || null,
      model,
      version,
      upstream_body: text.slice(0, 400),
    });
    return NextResponse.json(
      { error: text.slice(0, 400) || "transcription failed." },
      { status: 502 },
    );
  }

  const json = await response.json().catch((error) => {
    console.error("[cartesia-stt]", {
      user_id: user.id,
      stage: "parse",
      elapsed_ms: elapsed,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!json) {
    return NextResponse.json({ error: "transcription failed." }, { status: 502 });
  }

  const transcript =
    typeof (json as { text?: unknown }).text === "string"
      ? (json as { text: string }).text
      : "";

  console.info("[cartesia-stt]", {
    user_id: user.id,
    stage: "ok",
    status: response.status,
    elapsed_ms: elapsed,
    file_size: file.size,
    file_type: file.type || null,
    model,
    transcript_length: transcript.length,
    transcript_empty: transcript.trim().length === 0,
  });

  return NextResponse.json(json);
}
