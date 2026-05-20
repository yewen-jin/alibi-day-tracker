import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function createMemoryDb() {
  const state: Record<string, Array<Record<string, unknown>>> = {
    user_ai_settings: [],
    user_ai_provider_settings: [],
    user_secret_keys: [],
  };

  function matches(row: Record<string, unknown>, conditions: Array<[string, unknown]>) {
    return conditions.every(([column, value]) => row[column] === value);
  }

  function uniqueColumns(table: string) {
    if (table === "user_ai_settings") return ["user_id"];
    if (table === "user_ai_provider_settings") return ["user_id", "provider"];
    if (table === "user_secret_keys") return ["user_id", "purpose", "provider"];
    return [];
  }

  function upsert(table: string, values: Record<string, unknown>) {
    const columns = uniqueColumns(table);
    const existing = state[table].find((row) =>
      columns.every((column) => row[column] === values[column]),
    );
    if (existing) {
      Object.assign(existing, values);
      return;
    }
    state[table].push({ ...values });
  }

  function query(table: string) {
    const conditions: Array<[string, unknown]> = [];
    return {
      selectAll() {
        return this;
      },
      select() {
        return this;
      },
      where(column: string, _operator: string, value: unknown) {
        conditions.push([column, value]);
        return this;
      },
      orderBy() {
        return this;
      },
      async executeTakeFirst() {
        return state[table].find((row) => matches(row, conditions));
      },
      async execute() {
        return state[table].filter((row) => matches(row, conditions));
      },
    };
  }

  function insert(table: string) {
    let pending: Record<string, unknown> = {};
    return {
      values(values: Record<string, unknown>) {
        pending = values;
        return this;
      },
      onConflict() {
        return this;
      },
      async execute() {
        upsert(table, pending);
      },
    };
  }

  function update(table: string) {
    const conditions: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> = {};
    return {
      set(values: Record<string, unknown>) {
        patch = values;
        return this;
      },
      where(column: string, _operator: string, value: unknown) {
        conditions.push([column, value]);
        return this;
      },
      async execute() {
        for (const row of state[table]) {
          if (matches(row, conditions)) Object.assign(row, patch);
        }
      },
    };
  }

  function remove(table: string) {
    const conditions: Array<[string, unknown]> = [];
    return {
      where(column: string, _operator: string, value: unknown) {
        conditions.push([column, value]);
        return this;
      },
      async execute() {
        state[table] = state[table].filter((row) => !matches(row, conditions));
      },
    };
  }

  return {
    state,
    db: {
      selectFrom: query,
      insertInto: insert,
      updateTable: update,
      deleteFrom: remove,
    },
  };
}

async function loadAiSettingsWithMemoryDb() {
  const memory = createMemoryDb();

  vi.doMock("@/lib/db/client", () => ({
    getDb: () => memory.db,
  }));
  vi.doMock("@/lib/secret-crypto", () => ({
    encryptSecret: (value: string) => `encrypted:${value}`,
    decryptSecret: (value: string) => value.replace("encrypted:", ""),
    previewSecret: (value: string) => `${value.slice(0, 4)}...${value.slice(-4)}`,
  }));

  const module = await import("@/lib/ai-settings");
  return { ...module, memory };
}

describe("ai provider validation", () => {
  it("requires a base url for openai-compatible providers", async () => {
    const { validateAiProviderConfig } = await import("@/lib/ai-settings");
    const result = validateAiProviderConfig({
      provider: "openai_compatible",
      baseUrl: "",
    });

    expect(result.type).toBe("error");
  });

  it("rejects non-https remote base urls", async () => {
    const { validateAiProviderConfig } = await import("@/lib/ai-settings");
    const result = validateAiProviderConfig({
      provider: "openai_compatible",
      baseUrl: "http://example.com/v1",
    });

    expect(result.type).toBe("error");
  });

  it("accepts allowlisted hosted providers with defaults", async () => {
    const { validateAiProviderConfig } = await import("@/lib/ai-settings");
    const result = validateAiProviderConfig({
      provider: "openrouter",
      fastModel: "openai/gpt-4.1-nano",
      companionModel: "openai/gpt-5-mini",
    });

    expect(result).toMatchObject({
      type: "valid",
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
    });
  });
});

describe("ai profile settings", () => {
  it("returns a built-in profile when no custom keys are saved", async () => {
    const { getAiSettingsForUser } = await loadAiSettingsWithMemoryDb();

    const settings = await getAiSettingsForUser("user-1");

    expect(settings.mode).toBe("hosted");
    expect(settings.activeProfileId).toBe("hosted");
    expect(settings.profiles).toMatchObject([
      {
        id: "hosted",
        type: "hosted",
        label: "Built-in default API",
        editable: false,
        active: true,
      },
    ]);
  });

  it("keeps model choices scoped to each saved custom provider", async () => {
    const {
      getAiSettingsForUser,
      saveAiSettingsForUser,
      setActiveAiProviderForUser,
      updateAiModelsForUser,
    } = await loadAiSettingsWithMemoryDb();

    await saveAiSettingsForUser("user-1", {
      provider: "openrouter",
      apiKey: "sk-openrouter",
      fastModel: "openrouter-fast",
      companionModel: "openrouter-companion",
      disclosureAccepted: true,
    });
    await saveAiSettingsForUser("user-1", {
      provider: "openai",
      apiKey: "sk-openai",
      fastModel: "openai-fast",
      companionModel: "openai-companion",
      disclosureAccepted: true,
    });

    await setActiveAiProviderForUser("user-1", { provider: "openrouter" });
    let settings = await getAiSettingsForUser("user-1");
    expect(settings.activeProfileId).toBe("custom:openrouter");
    expect(settings.fastModel).toBe("openrouter-fast");
    expect(settings.companionModel).toBe("openrouter-companion");

    await setActiveAiProviderForUser("user-1", { provider: "openai" });
    settings = await getAiSettingsForUser("user-1");
    expect(settings.activeProfileId).toBe("custom:openai");
    expect(settings.fastModel).toBe("openai-fast");
    expect(settings.companionModel).toBe("openai-companion");

    await updateAiModelsForUser("user-1", {
      fastModel: "openai-updated-fast",
      companionModel: "openai-updated-companion",
    });
    settings = await getAiSettingsForUser("user-1");

    expect(
      settings.providerSettings.find((item) => item.provider === "openai"),
    ).toMatchObject({
      fastModel: "openai-updated-fast",
      companionModel: "openai-updated-companion",
    });
    expect(
      settings.providerSettings.find((item) => item.provider === "openrouter"),
    ).toMatchObject({
      fastModel: "openrouter-fast",
      companionModel: "openrouter-companion",
    });
  });

  it("resets to built-in defaults without deleting custom profiles", async () => {
    const {
      getAiSettingsForUser,
      resetAiSettingsToDefaultForUser,
      saveAiSettingsForUser,
      updateAiModelsForUser,
    } = await loadAiSettingsWithMemoryDb();

    await saveAiSettingsForUser("user-1", {
      provider: "openrouter",
      apiKey: "sk-openrouter",
      fastModel: "openrouter-fast",
      companionModel: "openrouter-companion",
      disclosureAccepted: true,
    });

    await resetAiSettingsToDefaultForUser("user-1");
    const settings = await getAiSettingsForUser("user-1");

    expect(settings.mode).toBe("hosted");
    expect(settings.activeProfileId).toBe("hosted");
    expect(settings.profiles.map((profile) => profile.id)).toEqual([
      "hosted",
      "custom:openrouter",
    ]);
    expect(settings.providerSettings[0]).toMatchObject({
      provider: "openrouter",
      fastModel: "openrouter-fast",
      companionModel: "openrouter-companion",
    });

    const update = await updateAiModelsForUser("user-1", {
      fastModel: "should-not-save",
      companionModel: "should-not-save",
    });
    expect(update).toMatchObject({
      type: "error",
      message: "select a custom API profile before changing models.",
    });
  });
});
