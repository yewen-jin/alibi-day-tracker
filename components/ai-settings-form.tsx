"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, RotateCcw, Server, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  chooseAiProvider,
  deleteAiSettings,
  resetAiSettingsToDefault,
  saveAiSettings,
  testAiSettings,
  updateAiModels,
} from "@/app/actions/ai-settings";
import { Dropdown } from "@/components/dropdown";
import type { AiProfileSnapshot, AiSettingsSnapshot } from "@/lib/ai-settings";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { AI_PROVIDER_PRESETS, findPresetById, type AiProviderPreset } from "@/lib/ai-provider-presets";

interface AiSettingsFormProps {
  initialSettings: AiSettingsSnapshot;
}

const DEFAULT_PRESET_ID = AI_PROVIDER_PRESETS[0]?.id ?? "openrouter-default";

export function AiSettingsForm({ initialSettings }: AiSettingsFormProps) {
  const router = useRouter();
  const activeProfile =
    initialSettings.profiles.find((profile) => profile.active) ??
    initialSettings.profiles[0];
  const [selectedProfileId, setSelectedProfileId] = useState(activeProfile.id);
  const [presetId, setPresetId] = useState<string>(
    activeProfile.type === "custom" && activeProfile.presetId
      ? activeProfile.presetId
      : DEFAULT_PRESET_ID,
  );
  const [baseUrl, setBaseUrl] = useState(activeProfile.type === "custom" ? activeProfile.baseUrl ?? "" : "");
  const [fastModel, setFastModel] = useState(activeProfile.fastModel);
  const [companionModel, setCompanionModel] = useState(activeProfile.companionModel);
  const [apiKey, setApiKey] = useState("");
  const [accepted, setAccepted] = useState(Boolean(activeProfile.disclosureAcceptedAt));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedProfile =
    initialSettings.profiles.find((profile) => profile.id === selectedProfileId) ??
    activeProfile;
  const preset = useMemo(() => findPresetById(presetId), [presetId]);
  const provider = preset?.provider ?? "openrouter";
  const providerConfig = AI_PROVIDERS[provider];
  const savedKeyForPreset = initialSettings.providerSettings.find(
    (item) => item.presetId === presetId,
  );
  const isBuiltInSelected = selectedProfile.type === "hosted";
  const persistedError =
    initialSettings.lastError && initialSettings.lastError !== activeProfile.lastError
      ? initialSettings.lastError
      : null;
  const transientError =
    error && error !== activeProfile.lastError && error !== initialSettings.lastError
      ? error
      : null;

  useEffect(() => {
    syncFromProfile(activeProfile);
  }, [activeProfile.id]);

  function syncFromProfile(profile: AiProfileSnapshot) {
    setSelectedProfileId(profile.id);
    setFastModel(profile.fastModel);
    setCompanionModel(profile.companionModel);
    if (profile.type === "custom") {
      const nextPresetId = profile.presetId ?? DEFAULT_PRESET_ID;
      setPresetId(nextPresetId);
      setBaseUrl(profile.baseUrl ?? "");
      setAccepted(Boolean(profile.disclosureAcceptedAt));
    }
  }

  function handleChooseProfile(profile: AiProfileSnapshot) {
    syncFromProfile(profile);
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await chooseAiProvider({
        profileId: profile.id,
        presetId: profile.presetId,
        provider: profile.type === "custom" ? profile.provider : "hosted",
        baseUrl: profile.baseUrl,
      });
      if (result.type === "error") {
        setError(result.message);
        return;
      }
      setMessage(`${profile.label} selected.`);
      router.refresh();
    });
  }

  function handlePresetChange(nextPresetId: string) {
    setPresetId(nextPresetId);
    const saved = initialSettings.providerSettings.find(
      (item) => item.presetId === nextPresetId,
    );
    const next = findPresetById(nextPresetId);
    setBaseUrl(saved?.baseUrl ?? next?.baseUrl ?? "");
    setFastModel(saved?.fastModel ?? next?.fastModel ?? fastModel);
    setCompanionModel(saved?.companionModel ?? next?.companionModel ?? companionModel);
    setAccepted(Boolean(saved?.disclosureAcceptedAt));
    setApiKey("");
    setMessage(null);
    setError(null);
  }

  function handleSaveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await saveAiSettings({
        presetId,
        provider,
        apiKey,
        baseUrl,
        fastModel,
        companionModel,
        disclosureAccepted: accepted,
      });

      if (result.type === "saved") {
        setApiKey("");
        setMessage("custom API key saved.");
        router.refresh();
        return;
      }

      setError(result.message);
    });
  }

  function handleSaveModels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await updateAiModels({
        fastModel,
        companionModel,
      });

      if (result.type === "saved") {
        setMessage("custom profile models saved.");
        router.refresh();
        return;
      }

      setError(result.message);
    });
  }

  function handleTest() {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await testAiSettings();

      if (result.type === "tested") {
        setMessage(`model test passed using ${result.provider}.`);
        router.refresh();
        return;
      }

      setError(result.message);
    });
  }

  function handleResetToDefault() {
    const builtIn = initialSettings.profiles.find((profile) => profile.type === "hosted");
    if (builtIn) syncFromProfile(builtIn);
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await resetAiSettingsToDefault();
      if (result.type === "error") {
        setError(result.message);
        return;
      }
      setFastModel(result.fastModel);
      setCompanionModel(result.companionModel);
      setMessage("built-in defaults selected.");
      router.refresh();
    });
  }

  function handleDeleteSavedKey(profile: AiProfileSnapshot) {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await deleteAiSettings({ presetId: profile.presetId });
      if (result.type === "error") {
        setError(result.message);
        return;
      }
      setApiKey("");
      setMessage(`${profile.label} key deleted.`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
      <div className="space-y-5">
        <section className="alibi-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                choose api profile
              </p>
              <h2 className="mt-1 text-xl font-black text-alibi-blue">
                active runtime source
              </h2>
            </div>
            <Server className="h-5 w-5 text-alibi-pink" />
          </div>

          <div className="mt-5 grid gap-3">
            {initialSettings.profiles.map((profile) => (
              <div
                key={profile.id}
                className={`alibi-block-item ${profile.active ? "ring-2 ring-alibi-blue/20" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => handleChooseProfile(profile)}
                  disabled={isPending}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-alibi-blue">{profile.label}</p>
                      <p className="mt-1 text-sm font-semibold text-alibi-teal">
                        {profile.providerLabel}
                        {profile.keyPreview ? ` · ${profile.keyPreview}` : " · environment key"}
                      </p>
                    </div>
                    <span className="rounded-full border border-alibi-lavender/40 bg-white px-3 py-1 text-xs font-black text-alibi-teal">
                      {profile.active ? "active" : profile.type}
                    </span>
                  </div>
                  <p className="mt-3 break-words text-xs font-semibold leading-5 text-alibi-teal">
                    fast: {profile.fastModel}
                  </p>
                  <p className="break-words text-xs font-semibold leading-5 text-alibi-teal">
                    companion: {profile.companionModel}
                  </p>
                </button>
                {profile.type === "custom" && profile.presetId && (
                  <button
                    type="button"
                    onClick={() => handleDeleteSavedKey(profile)}
                    disabled={isPending}
                    className="alibi-button-stop mt-3 inline-flex h-8 items-center justify-center gap-2 px-3 text-xs font-black"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    delete key
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {isBuiltInSelected ? (
          <section className="alibi-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                  built-in defaults
                </p>
                <h2 className="mt-1 text-xl font-black text-alibi-blue">
                  read-only model choices
                </h2>
              </div>
              <SlidersHorizontal className="h-5 w-5 text-alibi-pink" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="alibi-doc-card">
                <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-alibi-teal">
                  fast model
                </p>
                <p className="mt-1 break-words text-sm font-semibold text-alibi-ink">
                  {selectedProfile.fastModel}
                </p>
              </div>
              <div className="alibi-doc-card">
                <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-alibi-teal">
                  companion model
                </p>
                <p className="mt-1 break-words text-sm font-semibold text-alibi-ink">
                  {selectedProfile.companionModel}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <form onSubmit={handleSaveModels} className="alibi-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                  active profile models
                </p>
                <h2 className="mt-1 text-xl font-black text-alibi-blue">
                  {selectedProfile.label}
                </h2>
              </div>
              <SlidersHorizontal className="h-5 w-5 text-alibi-pink" />
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-sm font-black text-alibi-blue">fast model</span>
                <input
                  value={fastModel}
                  onChange={(event) => setFastModel(event.target.value)}
                  className="alibi-input h-11"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-black text-alibi-blue">companion model</span>
                <input
                  value={companionModel}
                  onChange={(event) => setCompanionModel(event.target.value)}
                  className="alibi-input h-11"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="alibi-button-teal inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                save models
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={isPending}
                className="alibi-button-secondary inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
              >
                test
              </button>
            </div>
          </form>
        )}

        <form onSubmit={handleSaveProvider} className="alibi-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
                add or replace custom key
              </p>
              <h2 className="mt-1 text-xl font-black text-alibi-blue">
                save provider key
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-alibi-teal">
                pick a preset to prefill the base url and recommended model ids. each preset is its own slot, so deepseek, qwen, moonshot etc. can coexist.
              </p>
            </div>
            <KeyRound className="h-5 w-5 text-alibi-pink" />
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-alibi-blue">preset</span>
              <Dropdown
                value={presetId}
                options={AI_PROVIDER_PRESETS.map((item: AiProviderPreset) => ({
                  value: item.id,
                  label: item.label,
                }))}
                onChange={handlePresetChange}
                placeholder="select a preset"
              />
              {preset && (
                <span className="text-xs font-semibold leading-5 text-alibi-teal">
                  {preset.notes}
                </span>
              )}
              {savedKeyForPreset?.keyPreview && (
                <span className="text-xs font-semibold text-alibi-teal">
                  saved key: {savedKeyForPreset.keyPreview} · saving replaces it.
                </span>
              )}
            </label>

            {providerConfig.customBaseUrl && (
              <label className="grid gap-1.5">
                <span className="text-sm font-black text-alibi-blue">base url</span>
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="alibi-input h-11"
                />
              </label>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-sm font-black text-alibi-blue">fast model</span>
                <input
                  value={fastModel}
                  onChange={(event) => setFastModel(event.target.value)}
                  className="alibi-input h-11"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-black text-alibi-blue">companion model</span>
                <input
                  value={companionModel}
                  onChange={(event) => setCompanionModel(event.target.value)}
                  className="alibi-input h-11"
                />
              </label>
            </div>

            <label className="grid gap-1.5">
              <span className="text-sm font-black text-alibi-blue">api key</span>
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                type="password"
                autoComplete="off"
                placeholder={savedKeyForPreset?.keyPreview ?? "paste a provider key"}
                className="alibi-input h-11"
              />
            </label>

            <label className="alibi-inset flex items-start gap-3 p-3">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-1 h-4 w-4 accent-alibi-blue"
              />
              <span className="text-sm font-semibold leading-6 text-alibi-teal">
                I understand Alibi will send chat, notes, time blocks, and memory context to my selected provider, and that provider terms and retention may apply.
              </span>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="alibi-button-teal inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              save key
            </button>
          </div>
        </form>
      </div>

      <aside className="alibi-card self-start p-5">
        <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
          active ai profile
        </p>
        <h2 className="mt-1 text-xl font-black text-alibi-blue">
          {activeProfile.label}
        </h2>
        <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-alibi-teal">
          <div className="alibi-doc-card">
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-alibi-teal">
              provider
            </p>
            <p className="mt-1 break-words text-alibi-ink">{activeProfile.providerLabel}</p>
            <p className="mt-1 break-words text-alibi-teal">
              key: {activeProfile.keyPreview ?? "environment"}
            </p>
          </div>
          <div className="alibi-doc-card">
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-alibi-teal">
              models
            </p>
            <p className="mt-1 break-words text-alibi-ink">
              fast: {activeProfile.fastModel}
            </p>
            <p className="mt-1 break-words text-alibi-ink">
              companion: {activeProfile.companionModel}
            </p>
          </div>
          <div className="alibi-doc-card">
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.12em] text-alibi-teal">
              test status
            </p>
            <p className="mt-1 text-alibi-ink">
              {activeProfile.testedAt ? new Date(activeProfile.testedAt).toLocaleString() : "never tested"}
            </p>
            {activeProfile.lastError && (
              <p className="mt-1 break-words text-alibi-pink">{activeProfile.lastError}</p>
            )}
          </div>
        </div>

        {persistedError && (
          <div className="alibi-banner-error mt-4">{persistedError}</div>
        )}
        {message && <div className="alibi-banner-info mt-4">{message}</div>}
        {transientError && <div className="alibi-banner-error mt-4">{transientError}</div>}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleResetToDefault}
            disabled={isPending || activeProfile.type === "hosted"}
            className="alibi-button-secondary inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
          >
            <RotateCcw className="h-4 w-4" />
            reset to built-in defaults
          </button>
        </div>
      </aside>
    </div>
  );
}
