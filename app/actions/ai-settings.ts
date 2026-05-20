"use server";

import { generateText } from "ai";
import { revalidatePath } from "next/cache";
import {
  deleteAiSettingsForUser,
  disableAiSettingsForUser,
  getAiSettingsForUser,
  markAiSettingsTested,
  resetAiSettingsToDefaultForUser,
  saveAiSettingsForUser,
  resolveAiModelsForUser,
  setActiveAiProviderForUser,
  updateAiModelsForUser,
  type AiSettingsSnapshot,
} from "@/lib/ai-settings";
import { requireSyncedUser } from "@/lib/auth/session";

function stringifyProviderDetail(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return stringifyProviderDetail(parsed) ?? trimmed.slice(0, 500);
    } catch {
      return trimmed.slice(0, 500);
    }
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nestedMessage =
      record.message ??
      record.error ??
      (typeof record.error === "object" && record.error
        ? (record.error as Record<string, unknown>).message
        : null);

    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage.trim().slice(0, 500);
    }

    try {
      return JSON.stringify(value).slice(0, 500);
    } catch {
      return null;
    }
  }

  return null;
}

function describeAiTestError(error: unknown, models: Awaited<ReturnType<typeof resolveAiModelsForUser>>) {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const status =
    typeof record.statusCode === "number"
      ? `HTTP ${record.statusCode}`
      : typeof record.status === "number"
        ? `HTTP ${record.status}`
        : null;
  const detail =
    stringifyProviderDetail(record.responseBody) ??
    stringifyProviderDetail(record.data) ??
    stringifyProviderDetail(record.cause);
  const message = error instanceof Error ? error.message : "model test failed.";
  const parts = [
    `${models.provider} test failed for ${models.fastModelId}`,
    status,
    detail ?? message,
  ].filter(Boolean);

  return parts.join(": ");
}

export async function getAiSettings(): Promise<AiSettingsSnapshot | null> {
  const user = await requireSyncedUser();
  return getAiSettingsForUser(user.id);
}

export async function saveAiSettings(input: {
  provider: string;
  apiKey: string;
  baseUrl?: string | null;
  disclosureAccepted: boolean;
}) {
  const user = await requireSyncedUser();
  try {
    const result = await saveAiSettingsForUser(user.id, input);
    revalidatePath("/app/settings");
    return result;
  } catch (error) {
    return {
      type: "error" as const,
      message:
        error instanceof Error && error.message.includes("user_ai_settings")
          ? "AI settings tables are not installed yet. Run db/migrations/004_integrations_ai_calendar_voice.sql."
          : "couldn't save AI settings.",
    };
  }
}

export async function updateAiModels(input: {
  fastModel?: string | null;
  companionModel?: string | null;
}) {
  const user = await requireSyncedUser();
  try {
    const result = await updateAiModelsForUser(user.id, input);
    revalidatePath("/app/settings");
    return result;
  } catch (error) {
    return {
      type: "error" as const,
      message:
        error instanceof Error && error.message.includes("user_ai_settings")
          ? "AI settings tables are not installed yet. Run db/migrations/004_integrations_ai_calendar_voice.sql."
          : "couldn't update model settings.",
    };
  }
}

export async function resetAiSettingsToDefault() {
  const user = await requireSyncedUser();
  try {
    const result = await resetAiSettingsToDefaultForUser(user.id);
    revalidatePath("/app/settings");
    return result;
  } catch (error) {
    return {
      type: "error" as const,
      message:
        error instanceof Error && error.message.includes("user_ai_settings")
          ? "AI settings tables are not installed yet. Run db/migrations/004_integrations_ai_calendar_voice.sql."
          : "couldn't reset AI settings.",
    };
  }
}

export async function resetAiModels() {
  return resetAiSettingsToDefault();
}

export async function chooseAiProvider(input: {
  profileId?: string;
  provider?: string;
  baseUrl?: string | null;
}) {
  const user = await requireSyncedUser();
  try {
    const result = await setActiveAiProviderForUser(user.id, input);
    revalidatePath("/app/settings");
    return result;
  } catch (error) {
    return {
      type: "error" as const,
      message:
        error instanceof Error && error.message.includes("user_ai_settings")
          ? "AI settings tables are not installed yet. Run db/migrations/004_integrations_ai_calendar_voice.sql."
          : "couldn't choose provider.",
    };
  }
}

export async function disableAiSettings() {
  const user = await requireSyncedUser();
  try {
    await disableAiSettingsForUser(user.id);
    revalidatePath("/app/settings");
    return { type: "disabled" as const };
  } catch {
    return { type: "error" as const, message: "couldn't disable AI settings." };
  }
}

export async function deleteAiSettings() {
  const user = await requireSyncedUser();
  try {
    const result = await deleteAiSettingsForUser(user.id);
    revalidatePath("/app/settings");
    return result;
  } catch {
    return { type: "error" as const, message: "couldn't delete AI settings." };
  }
}

export async function testAiSettings() {
  const user = await requireSyncedUser();
  const models = await resolveAiModelsForUser(user.id);

  if (models.mode === "hosted" && !process.env.OPENROUTER_API_KEY) {
    const message = "built-in OpenRouter API key is not configured on the server.";
    await markAiSettingsTested(user.id, { ok: false, error: message }).catch(() => undefined);
    revalidatePath("/app/settings");
    return { type: "error" as const, message };
  }

  try {
    const { text } = await generateText({
      model: models.fastModel,
      prompt: "Reply with exactly: ok",
      maxOutputTokens: 16,
    });

    const ok = text.trim().toLowerCase().includes("ok");
    await markAiSettingsTested(
      user.id,
      ok ? { ok: true } : { ok: false, error: "test response did not include ok." },
    ).catch(() => undefined);
    revalidatePath("/app/settings");
    return ok
      ? { type: "tested" as const, provider: models.provider }
      : { type: "error" as const, message: "test response did not include ok." };
  } catch (error) {
    const message = describeAiTestError(error, models);
    await markAiSettingsTested(user.id, { ok: false, error: message }).catch(() => undefined);
    revalidatePath("/app/settings");
    return { type: "error" as const, message };
  }
}
