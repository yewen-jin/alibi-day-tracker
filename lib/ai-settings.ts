import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { getDb } from "@/lib/db/client";
import {
  decryptSecret,
  encryptSecret,
  isSecretDecryptionError,
  previewSecret,
} from "@/lib/secret-crypto";
import { companionModel, companionModelId, fastModel, fastModelId } from "@/lib/ai";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/ai-providers";
import {
  findPresetById,
  presetLabelFor,
  presetProviderFor,
} from "@/lib/ai-provider-presets";

export interface AiSettingsSnapshot {
  mode: "hosted" | "custom";
  activeProfileId: string;
  presetId: string | null;
  provider: AiProviderId;
  baseUrl: string | null;
  fastModel: string;
  companionModel: string;
  keyPreview: string | null;
  disclosureAcceptedAt: string | null;
  disabledAt: string | null;
  testedAt: string | null;
  lastError: string | null;
  profiles: AiProfileSnapshot[];
  providerSettings: AiProviderSettingsSnapshot[];
}

export interface AiProfileSnapshot {
  id: string;
  type: "hosted" | "custom";
  label: string;
  presetId: string | null;
  provider: AiProviderId;
  providerLabel: string;
  baseUrl: string | null;
  fastModel: string;
  companionModel: string;
  keyPreview: string | null;
  disclosureAcceptedAt: string | null;
  disabledAt: string | null;
  testedAt: string | null;
  lastError: string | null;
  editable: boolean;
  active: boolean;
}

export interface AiProviderSettingsSnapshot {
  presetId: string;
  presetLabel: string;
  provider: AiProviderId;
  baseUrl: string | null;
  fastModel: string;
  companionModel: string;
  keyPreview: string | null;
  disclosureAcceptedAt: string | null;
  disabledAt: string | null;
  testedAt: string | null;
  lastError: string | null;
}

export interface ResolvedAiModels {
  mode: "hosted" | "custom";
  provider: string;
  fastModelId: string;
  companionModelId: string;
  fastModel: LanguageModel;
  companionModel: LanguageModel;
}

function normalizeProvider(value: string | null | undefined): AiProviderId {
  return value === "openrouter" ||
    value === "openai" ||
    value === "openai_compatible" ||
    value === "anthropic"
    ? value
    : "openrouter";
}

function normalizeMode(value: string | null | undefined): "hosted" | "custom" {
  return value === "custom" ? "custom" : "hosted";
}

function hostedProfile(active: boolean, lastError: string | null = null): AiProfileSnapshot {
  return {
    id: "hosted",
    type: "hosted",
    label: "Built-in default API",
    presetId: null,
    provider: "openrouter",
    providerLabel: "OpenRouter",
    baseUrl: AI_PROVIDERS.openrouter.defaultBaseUrl,
    fastModel: fastModelId,
    companionModel: companionModelId,
    keyPreview: null,
    disclosureAcceptedAt: null,
    disabledAt: null,
    testedAt: null,
    lastError,
    editable: false,
    active,
  };
}

function customProfile(
  settings: AiProviderSettingsSnapshot,
  active: boolean,
): AiProfileSnapshot {
  return {
    id: `custom:${settings.presetId}`,
    type: "custom",
    label: settings.presetLabel,
    presetId: settings.presetId,
    provider: settings.provider,
    providerLabel: AI_PROVIDERS[settings.provider].label,
    baseUrl: settings.baseUrl,
    fastModel: settings.fastModel,
    companionModel: settings.companionModel,
    keyPreview: settings.keyPreview,
    disclosureAcceptedAt: settings.disclosureAcceptedAt,
    disabledAt: settings.disabledAt,
    testedAt: settings.testedAt,
    lastError: settings.lastError,
    editable: true,
    active,
  };
}

function defaultAiSettings(lastError: string | null = null): AiSettingsSnapshot {
  const profile = hostedProfile(true, lastError);
  return {
    mode: "hosted",
    activeProfileId: profile.id,
    presetId: null,
    provider: "openrouter",
    baseUrl: profile.baseUrl,
    fastModel: profile.fastModel,
    companionModel: profile.companionModel,
    keyPreview: null,
    disclosureAcceptedAt: null,
    disabledAt: null,
    testedAt: null,
    lastError,
    profiles: [profile],
    providerSettings: [],
  };
}

function resolvePresetSpec(input: {
  presetId?: string | null;
  provider: string;
  baseUrl?: string | null;
  fastModel?: string | null;
  companionModel?: string | null;
}) {
  const presetId = (input.presetId ?? "").trim() || input.provider;
  const known = findPresetById(presetId);
  const provider = known
    ? known.provider
    : presetProviderFor(presetId, normalizeProvider(input.provider));
  const baseUrl =
    input.baseUrl?.trim() ||
    known?.baseUrl ||
    AI_PROVIDERS[provider].defaultBaseUrl;
  const fastModel = input.fastModel?.trim() || known?.fastModel || fastModelId;
  const companionModel =
    input.companionModel?.trim() || known?.companionModel || companionModelId;
  return { presetId, provider, baseUrl, fastModel, companionModel };
}

function isMissingRelationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}

export function validateAiProviderConfig(input: {
  provider: string;
  baseUrl?: string | null;
  fastModel?: string | null;
  companionModel?: string | null;
}) {
  const provider = normalizeProvider(input.provider);
  const providerConfig = AI_PROVIDERS[provider];
  const fast = input.fastModel?.trim() || fastModelId;
  const companion = input.companionModel?.trim() || companionModelId;
  const baseUrl = input.baseUrl?.trim() || providerConfig.defaultBaseUrl;

  if (providerConfig.customBaseUrl && !baseUrl) {
    return { type: "error" as const, message: "base url is required for OpenAI-compatible providers." };
  }

  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
        return { type: "error" as const, message: "provider base url must use https." };
      }
    } catch {
      return { type: "error" as const, message: "provider base url is invalid." };
    }
  }

  return { type: "valid" as const, provider, baseUrl, fastModel: fast, companionModel: companion };
}

export async function getAiSettingsForUser(userId: string): Promise<AiSettingsSnapshot> {
  let row:
    | {
        mode: string;
        provider: string;
        preset_id: string | null;
        base_url: string | null;
        fast_model: string;
        companion_model: string;
        key_preview: string | null;
        disclosure_accepted_at: string | null;
        disabled_at: string | null;
        tested_at: string | null;
        last_error: string | null;
      }
    | undefined;

  let providerRows: Array<{
    provider: string;
    preset_id: string;
    base_url: string | null;
    fast_model: string;
    companion_model: string;
    key_preview: string | null;
    disclosure_accepted_at: string | null;
    disabled_at: string | null;
    tested_at: string | null;
    last_error: string | null;
  }> = [];

  try {
    [row, providerRows] = await Promise.all([
      getDb()
        .selectFrom("user_ai_settings")
        .selectAll()
        .where("user_id", "=", userId)
        .executeTakeFirst(),
      getDb()
        .selectFrom("user_ai_provider_settings")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("updated_at", "desc")
        .execute(),
    ]);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return defaultAiSettings("AI settings tables are not installed yet. Run db/migrations/004_integrations_ai_calendar_voice.sql.");
    }

    throw error;
  }

  const providerSettings: AiProviderSettingsSnapshot[] = providerRows.map((item) => {
    const provider = normalizeProvider(item.provider);
    const presetId = item.preset_id || item.provider;
    return {
      presetId,
      presetLabel: presetLabelFor(presetId, provider),
      provider,
      baseUrl: item.base_url,
      fastModel: item.fast_model,
      companionModel: item.companion_model,
      keyPreview: item.key_preview,
      disclosureAcceptedAt: item.disclosure_accepted_at,
      disabledAt: item.disabled_at,
      testedAt: item.tested_at,
      lastError: item.last_error,
    };
  });

  if (!row) {
    const profiles = [
      hostedProfile(true),
      ...providerSettings.map((item) => customProfile(item, false)),
    ];

    return {
      ...defaultAiSettings(),
      profiles,
      providerSettings,
    };
  }

  const activeProvider = normalizeProvider(row.provider);
  const activePresetId = row.preset_id || row.provider;
  const requestedMode = normalizeMode(row.mode);
  const activeProviderSettings = providerSettings.find(
    (item) => item.presetId === activePresetId,
  );
  const activeProfile =
    requestedMode === "custom" && activeProviderSettings?.keyPreview
      ? customProfile(activeProviderSettings, true)
      : hostedProfile(true);
  const profiles = [
    hostedProfile(activeProfile.type === "hosted"),
    ...providerSettings.map((item) =>
      customProfile(
        item,
        activeProfile.type === "custom" && item.presetId === activePresetId,
      ),
    ),
  ];

  return {
    mode: activeProfile.type,
    activeProfileId: activeProfile.id,
    presetId: activeProfile.presetId,
    provider: activeProfile.provider,
    baseUrl: activeProfile.baseUrl ?? row.base_url,
    fastModel: activeProfile.fastModel,
    companionModel: activeProfile.companionModel,
    keyPreview: activeProfile.keyPreview,
    disclosureAcceptedAt:
      activeProfile.disclosureAcceptedAt ?? row.disclosure_accepted_at,
    disabledAt: activeProfile.disabledAt ?? row.disabled_at,
    testedAt: activeProfile.testedAt ?? row.tested_at,
    lastError: activeProfile.lastError ?? row.last_error,
    profiles,
    providerSettings,
  };
}

async function getAiProviderSecret(userId: string, presetId: string) {
  const row = await getDb()
    .selectFrom("user_secret_keys")
    .select(["encrypted_value"])
    .where("user_id", "=", userId)
    .where("purpose", "=", "ai_provider_key")
    .where("preset_id", "=", presetId)
    .executeTakeFirst();

  return row ? decryptSecret(row.encrypted_value) : null;
}

export async function saveAiSettingsForUser(
  userId: string,
  input: {
    presetId?: string | null;
    provider: string;
    apiKey: string;
    baseUrl?: string | null;
    fastModel?: string | null;
    companionModel?: string | null;
    disclosureAccepted: boolean;
  },
) {
  if (!input.disclosureAccepted) {
    return { type: "error" as const, message: "confirm the provider data disclosure before saving." };
  }

  const spec = resolvePresetSpec(input);
  const existing = await getAiSettingsForUser(userId);
  const existingForPreset = existing.providerSettings.find(
    (item) => item.presetId === spec.presetId,
  );
  const validated = validateAiProviderConfig({
    provider: spec.provider,
    baseUrl: spec.baseUrl,
    fastModel:
      input.fastModel ?? existingForPreset?.fastModel ?? spec.fastModel,
    companionModel:
      input.companionModel ??
      existingForPreset?.companionModel ??
      spec.companionModel,
  });
  if (validated.type === "error") return validated;

  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    return { type: "error" as const, message: "api key is required." };
  }

  const presetId = spec.presetId;

  await getDb()
    .insertInto("user_secret_keys")
    .values({
      user_id: userId,
      purpose: "ai_provider_key",
      provider: validated.provider,
      preset_id: presetId,
      encrypted_value: encryptSecret(apiKey),
      key_hint: previewSecret(apiKey),
    })
    .onConflict((oc) =>
      oc.columns(["user_id", "purpose", "preset_id"]).doUpdateSet({
        provider: validated.provider,
        encrypted_value: encryptSecret(apiKey),
        key_hint: previewSecret(apiKey),
        updated_at: new Date().toISOString(),
      }),
    )
    .execute();

  await getDb()
    .insertInto("user_ai_provider_settings")
    .values({
      user_id: userId,
      provider: validated.provider,
      preset_id: presetId,
      base_url: validated.baseUrl,
      fast_model: validated.fastModel,
      companion_model: validated.companionModel,
      key_preview: previewSecret(apiKey),
      disclosure_accepted_at: new Date().toISOString(),
      disabled_at: null,
      last_error: null,
    })
    .onConflict((oc) =>
      oc.columns(["user_id", "preset_id"]).doUpdateSet({
        provider: validated.provider,
        base_url: validated.baseUrl,
        fast_model: validated.fastModel,
        companion_model: validated.companionModel,
        key_preview: previewSecret(apiKey),
        disclosure_accepted_at: new Date().toISOString(),
        disabled_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }),
    )
    .execute();

  await getDb()
    .insertInto("user_ai_settings")
    .values({
      user_id: userId,
      mode: "custom",
      provider: validated.provider,
      preset_id: presetId,
      base_url: validated.baseUrl,
      fast_model: validated.fastModel,
      companion_model: validated.companionModel,
      key_preview: previewSecret(apiKey),
      disclosure_accepted_at: new Date().toISOString(),
      disabled_at: null,
      last_error: null,
    })
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        mode: "custom",
        provider: validated.provider,
        preset_id: presetId,
        base_url: validated.baseUrl,
        fast_model: validated.fastModel,
        companion_model: validated.companionModel,
        key_preview: previewSecret(apiKey),
        disclosure_accepted_at: new Date().toISOString(),
        disabled_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }),
    )
    .execute();

  return { type: "saved" as const, presetId };
}

export async function updateAiModelsForUser(
  userId: string,
  input: {
    fastModel?: string | null;
    companionModel?: string | null;
  },
) {
  const settings = await getAiSettingsForUser(userId);

  if (settings.mode !== "custom" || !settings.keyPreview || !settings.presetId) {
    return { type: "error" as const, message: "select a custom API profile before changing models." };
  }

  const validated = validateAiProviderConfig({
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    fastModel: input.fastModel,
    companionModel: input.companionModel,
  });
  if (validated.type === "error") return validated;

  await getDb()
    .updateTable("user_ai_provider_settings")
    .set({
      fast_model: validated.fastModel,
      companion_model: validated.companionModel,
      tested_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .where("user_id", "=", userId)
    .where("preset_id", "=", settings.presetId)
    .execute();

  await getDb()
    .updateTable("user_ai_settings")
    .set({
      fast_model: validated.fastModel,
      companion_model: validated.companionModel,
      tested_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .where("user_id", "=", userId)
    .execute();

  return { type: "saved" as const };
}

export async function resetAiSettingsToDefaultForUser(userId: string) {
  await getDb()
    .insertInto("user_ai_settings")
    .values({
      user_id: userId,
      mode: "hosted",
      provider: "openrouter",
      preset_id: null,
      base_url: AI_PROVIDERS.openrouter.defaultBaseUrl,
      fast_model: fastModelId,
      companion_model: companionModelId,
      key_preview: null,
      disclosure_accepted_at: null,
      disabled_at: null,
      tested_at: null,
      last_error: null,
    })
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        mode: "hosted",
        provider: "openrouter",
        preset_id: null,
        base_url: AI_PROVIDERS.openrouter.defaultBaseUrl,
        fast_model: fastModelId,
        companion_model: companionModelId,
        key_preview: null,
        disclosure_accepted_at: null,
        disabled_at: null,
        tested_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }),
    )
    .execute();

  return {
    type: "saved" as const,
    fastModel: fastModelId,
    companionModel: companionModelId,
  };
}

export async function resetAiModelsForUser(userId: string) {
  return resetAiSettingsToDefaultForUser(userId);
}

export async function disableAiSettingsForUser(userId: string) {
  await resetAiSettingsToDefaultForUser(userId);
}

export async function deleteAiSettingsForUser(
  userId: string,
  input: { presetId?: string | null } = {},
) {
  const settings = await getAiSettingsForUser(userId);
  const targetPresetId = input.presetId ?? settings.presetId;

  if (!targetPresetId) {
    return { type: "error" as const, message: "select a custom API profile before deleting a key." };
  }

  await getDb()
    .deleteFrom("user_secret_keys")
    .where("user_id", "=", userId)
    .where("purpose", "=", "ai_provider_key")
    .where("preset_id", "=", targetPresetId)
    .execute();

  await getDb()
    .deleteFrom("user_ai_provider_settings")
    .where("user_id", "=", userId)
    .where("preset_id", "=", targetPresetId)
    .execute();

  if (settings.presetId === targetPresetId) {
    await resetAiSettingsToDefaultForUser(userId);
  }

  return { type: "deleted" as const, presetId: targetPresetId };
}

export async function setActiveAiProviderForUser(
  userId: string,
  input: {
    profileId?: string;
    presetId?: string | null;
    provider?: string;
    baseUrl?: string | null;
  },
) {
  if (input.profileId === "hosted" || input.provider === "hosted") {
    await resetAiSettingsToDefaultForUser(userId);
    return {
      type: "selected" as const,
      settings: hostedProfile(true),
    };
  }

  const presetId =
    input.presetId?.trim() ||
    input.profileId?.replace(/^custom:/, "") ||
    input.provider ||
    "";
  if (!presetId) {
    return { type: "error" as const, message: "missing preset id." };
  }

  const settings = await getAiSettingsForUser(userId);
  const providerSettings = settings.providerSettings.find(
    (item) => item.presetId === presetId,
  );

  if (!providerSettings?.keyPreview) {
    return { type: "error" as const, message: "save a provider key before choosing it." };
  }

  await getDb()
    .insertInto("user_ai_settings")
    .values({
      user_id: userId,
      mode: "custom",
      provider: providerSettings.provider,
      preset_id: presetId,
      base_url: providerSettings.baseUrl ?? input.baseUrl ?? null,
      fast_model: providerSettings.fastModel,
      companion_model: providerSettings.companionModel,
      key_preview: providerSettings.keyPreview,
      disclosure_accepted_at: providerSettings.disclosureAcceptedAt,
      disabled_at: null,
      tested_at: providerSettings.testedAt,
      last_error: providerSettings.lastError,
    })
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        mode: "custom",
        provider: providerSettings.provider,
        preset_id: presetId,
        base_url: providerSettings.baseUrl ?? input.baseUrl ?? null,
        fast_model: providerSettings.fastModel,
        companion_model: providerSettings.companionModel,
        key_preview: providerSettings.keyPreview,
        disclosure_accepted_at: providerSettings.disclosureAcceptedAt,
        disabled_at: null,
        tested_at: providerSettings.testedAt,
        last_error: providerSettings.lastError,
        updated_at: new Date().toISOString(),
      }),
    )
    .execute();

  return {
    type: "selected" as const,
    settings: providerSettings,
  };
}

export async function resolveAiModelsForUser(
  userId: string,
  options: {
    throwOnSecretError?: boolean;
  } = {},
): Promise<ResolvedAiModels> {
  const settings = await getAiSettingsForUser(userId);

  if (settings.mode !== "custom" || settings.disabledAt) {
    return {
      mode: "hosted",
      provider: "openrouter",
      fastModelId,
      companionModelId,
      fastModel,
      companionModel,
    };
  }

  if (!settings.presetId) {
    return {
      mode: "hosted",
      provider: "openrouter",
      fastModelId,
      companionModelId,
      fastModel,
      companionModel,
    };
  }

  let key: string | null = null;
  try {
    key = await getAiProviderSecret(userId, settings.presetId);
  } catch (error) {
    if (options.throwOnSecretError || !isSecretDecryptionError(error)) {
      throw error;
    }

    console.error("saved custom AI provider key could not be decrypted", {
      userId,
      provider: settings.provider,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      mode: "hosted",
      provider: "openrouter",
      fastModelId,
      companionModelId,
      fastModel,
      companionModel,
    };
  }
  const providerConfig = AI_PROVIDERS[settings.provider];
  const baseURL = settings.baseUrl || providerConfig.defaultBaseUrl;

  if (!key || !baseURL) {
    return {
      mode: "hosted",
      provider: "openrouter",
      fastModelId,
      companionModelId,
      fastModel,
      companionModel,
    };
  }

  if (settings.provider === "anthropic") {
    const provider = createAnthropic({ apiKey: key });

    return {
      mode: "custom",
      provider: settings.provider,
      fastModelId: settings.fastModel,
      companionModelId: settings.companionModel,
      fastModel: provider(settings.fastModel),
      companionModel: provider(settings.companionModel),
    };
  }

  const provider = createOpenAICompatible({
    name: settings.provider,
    baseURL,
    apiKey: key,
  });

  return {
    mode: "custom",
    provider: settings.provider,
    fastModelId: settings.fastModel,
    companionModelId: settings.companionModel,
    fastModel: provider(settings.fastModel),
    companionModel: provider(settings.companionModel),
  };
}

export async function markAiSettingsTested(
  userId: string,
  result: { ok: true } | { ok: false; error: string },
) {
  const settings = await getAiSettingsForUser(userId);

  if (settings.mode === "custom" && settings.presetId) {
    await getDb()
      .updateTable("user_ai_provider_settings")
      .set({
        tested_at: new Date().toISOString(),
        last_error: result.ok ? null : result.error.slice(0, 400),
        updated_at: new Date().toISOString(),
      })
      .where("user_id", "=", userId)
      .where("preset_id", "=", settings.presetId)
      .execute();
  }

  await getDb()
    .updateTable("user_ai_settings")
    .set({
      tested_at: new Date().toISOString(),
      last_error: result.ok ? null : result.error.slice(0, 400),
      updated_at: new Date().toISOString(),
    })
    .where("user_id", "=", userId)
    .execute();
}
