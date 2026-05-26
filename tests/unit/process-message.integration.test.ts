import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanionDraft, TimeBlock } from "@/lib/types";

vi.mock("server-only", () => ({}));

type Row = Record<string, any>;

function createSupabaseMemory() {
  const state: Record<string, Row[]> = {
    companion_conversations: [],
    companion_messages: [],
    companion_drafts: [],
    time_blocks: [],
  };
  let sequence = 0;

  function id(prefix: string) {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  function tableRows(table: string) {
    state[table] ??= [];
    return state[table];
  }

  function matches(row: Row, filters: Array<(row: Row) => boolean>) {
    return filters.every((filter) => filter(row));
  }

  class Query {
    private op: "select" | "insert" | "update" | "upsert" = "select";
    private values: Row | Row[] | null = null;
    private patch: Row | null = null;
    private filters: Array<(row: Row) => boolean> = [];
    private limitCount: number | null = null;
    private orderColumn: string | null = null;
    private orderAscending = true;

    constructor(private table: string) {}

    select() {
      if (!this.values && !this.patch) this.op = "select";
      return this;
    }

    insert(values: Row | Row[]) {
      this.op = "insert";
      this.values = values;
      return this;
    }

    upsert(values: Row | Row[]) {
      this.op = "upsert";
      this.values = values;
      return this;
    }

    update(values: Row) {
      this.op = "update";
      this.patch = values;
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    is(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    order(column: string, options?: { ascending?: boolean }) {
      this.orderColumn = column;
      this.orderAscending = options?.ascending !== false;
      return this;
    }

    limit(count: number) {
      this.limitCount = count;
      return this;
    }

    async maybeSingle() {
      const result = await this.execute();
      return {
        data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
        error: null,
      };
    }

    async single() {
      const result = await this.execute();
      return {
        data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
        error: null,
      };
    }

    then<TResult1 = { data: Row[] | Row | null; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: Row[] | Row | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return this.execute().then(onfulfilled, onrejected);
    }

    private async execute() {
      if (this.op === "insert") {
        const rows = (Array.isArray(this.values) ? this.values : [this.values]).filter(Boolean) as Row[];
        const inserted = rows.map((row) => this.prepareInsertedRow(row));
        tableRows(this.table).push(...inserted);
        return { data: inserted, error: null };
      }

      if (this.op === "upsert") {
        const rows = (Array.isArray(this.values) ? this.values : [this.values]).filter(Boolean) as Row[];
        const upserted = rows.map((row) => this.prepareUpsertedRow(row));
        return { data: upserted, error: null };
      }

      if (this.op === "update") {
        for (const row of tableRows(this.table)) {
          if (matches(row, this.filters)) {
            Object.assign(row, this.patch);
          }
        }
        return { data: null, error: null };
      }

      let rows = tableRows(this.table).filter((row) => matches(row, this.filters));
      if (this.orderColumn) {
        const column = this.orderColumn;
        const direction = this.orderAscending ? 1 : -1;
        rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * direction);
      }
      if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
      return { data: rows, error: null };
    }

    private prepareInsertedRow(row: Row) {
      const now = new Date().toISOString();
      if (this.table === "companion_conversations") {
        return {
          id: id("conversation"),
          created_at: now,
          updated_at: now,
          ...row,
        };
      }
      if (this.table === "companion_messages") {
        return {
          id: id("message"),
          created_at: now,
          updated_at: now,
          ...row,
        };
      }
      return { id: id(this.table), created_at: now, updated_at: now, ...row };
    }

    private prepareUpsertedRow(row: Row) {
      if (this.table !== "companion_drafts") {
        const inserted = this.prepareInsertedRow(row);
        tableRows(this.table).push(inserted);
        return inserted;
      }

      const existing = tableRows(this.table).find(
        (item) =>
          item.user_id === row.user_id &&
          item.conversation_id === row.conversation_id,
      );

      if (existing) {
        Object.assign(existing, row);
        return existing;
      }

      const inserted = this.prepareInsertedRow(row);
      tableRows(this.table).push(inserted);
      return inserted;
    }
  }

  return {
    state,
    client: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from(table: string) {
        return new Query(table);
      },
    },
  };
}

function draft(overrides: Partial<CompanionDraft>): CompanionDraft & { intent: string } {
  return {
    intent: "log_block",
    task_name: null,
    category: null,
    hashtags: [],
    notes: null,
    started_at: null,
    ended_at: null,
    duration_minutes: null,
    mood: null,
    effort_level: null,
    satisfaction: null,
    avoidance_marker: false,
    hyperfocus_marker: false,
    guilt_marker: false,
    novelty_marker: false,
    ...overrides,
  };
}

async function loadProcessMessage(routeOutput: CompanionDraft & { intent: string }) {
  const memory = createSupabaseMemory();
  const generateText = vi.fn(async (options: { output?: unknown; prompt?: string; system?: string }) => {
    if (options.output) {
      const prompt = [options.system ?? "", options.prompt ?? ""].join("\n");
      if (prompt.includes("Extract a grounded evidence synthesis")) {
        return {
          output: {
            summary: "screen time appears in the saved record",
            key_evidence: ["screen time"],
            pattern_hint: null,
          },
        };
      }
      return { output: routeOutput };
    }
    return { text: "logged." };
  });
  const saveBlock = vi.fn(async (input: Record<string, unknown>) => ({
    type: "saved",
    timeBlock: {
      id: "block-1",
      user_id: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      duration_seconds: null,
      ...input,
    } as TimeBlock,
  }));
  const startTimer = vi.fn(async (input: Record<string, unknown> | undefined) => ({
    type: "started",
    activeTimer: {
      user_id: "user-1",
      started_at: input?.started_at ?? new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  }));

  vi.doMock("next/server", () => ({ after: vi.fn() }));
  vi.doMock("ai", () => ({
    generateText,
    Output: { object: vi.fn((value) => value) },
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => memory.client),
  }));
  vi.doMock("@/lib/ai-settings", () => ({
    resolveAiModelsForUser: vi.fn(async () => ({
      provider: "hosted",
      fastModel: "fast-model",
      fastModelId: "fast-model",
      companionModel: "companion-model",
      companionModelId: "companion-model",
    })),
  }));
  vi.doMock("@/lib/chat-insights", () => ({
    generateCompanionMessageInsightRecord: vi.fn(async () => null),
    deriveCompanionMessageInsightRecord: vi.fn(() => null),
  }));
  vi.doMock("@/lib/memory-context", () => ({
    buildCompanionMemoryContext: vi.fn(async () => ({
      range: { scope: "today", label: "today" },
      blocks: [],
      chatInsights: [],
      recentMessages: [],
      evidenceText: "(empty)",
    })),
    formatBlockForMemory: vi.fn(() => "formatted block"),
  }));
  vi.doMock("@/lib/rag/retriever", () => ({
    retrieveMemoryContext: vi.fn(async () => ({
      chunks: [],
      sourceSummaries: [],
      score: 0,
      dateWindow: null,
      promptText: "(empty)",
    })),
  }));
  vi.doMock("@/lib/rag/indexer", () => ({
    indexMemoryForCompanionMessage: vi.fn(async () => undefined),
    indexMemoryForCompanionMessageInsight: vi.fn(async () => undefined),
  }));
  vi.doMock("@/app/actions/timer", () => ({
    saveBlock,
    startTimer,
    stopTimer: vi.fn(),
  }));

  const module = await import("@/app/actions/process-message");
  return { processCompanionMessage: module.processCompanionMessage, generateText, saveBlock, startTimer, memory };
}

describe("processCompanionMessage semantic duration flows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("logs completed duration-only work as the duration immediately before now", async () => {
    const { processCompanionMessage, saveBlock, startTimer } = await loadProcessMessage(
      draft({
        intent: "log_block",
        task_name: "email",
        category: null,
        duration_minutes: 30,
      }),
    );

    const result = await processCompanionMessage({
      text: "terminé correo durante 30 minutos",
      timezone: "Europe/Madrid",
    });

    expect(result.type).toBe("logged");
    expect(startTimer).not.toHaveBeenCalled();
    expect(saveBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        task_name: "email",
        category: "admin",
        started_at: "2026-05-24T11:30:00.000Z",
        ended_at: "2026-05-24T12:00:00.000Z",
        note_source: "chat",
      }),
    );
  });

  it("starts ongoing duration-only work as an open timer backdated by the duration", async () => {
    const { processCompanionMessage, saveBlock, startTimer } = await loadProcessMessage(
      draft({
        intent: "start_timer",
        task_name: "email",
        category: null,
        duration_minutes: 30,
      }),
    );

    const result = await processCompanionMessage({
      text: "llevo 30 minutos con el correo",
      timezone: "Europe/Madrid",
    });

    expect(result.type).toBe("timer_started");
    expect(saveBlock).not.toHaveBeenCalled();
    expect(startTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        task_name: "email",
        category: "admin",
        started_at: "2026-05-24T11:30:00.000Z",
      }),
    );
  });

  it("clarifies instead of saving when category evidence is absent or ambiguous", async () => {
    const { processCompanionMessage, saveBlock, startTimer, memory } = await loadProcessMessage(
      draft({
        intent: "log_block",
        task_name: "something",
        category: null,
        duration_minutes: 30,
      }),
    );

    const result = await processCompanionMessage({
      text: "i did something for 30 minutes",
      timezone: "Europe/London",
    });

    expect(result.type).toBe("clarify");
    expect(saveBlock).not.toHaveBeenCalled();
    expect(startTimer).not.toHaveBeenCalled();
    expect(memory.state.companion_drafts[0]?.draft).toMatchObject({
      task_name: "something",
      duration_minutes: 30,
    });
  });

  it("updates the attached time block from its companion thread", async () => {
    const { processCompanionMessage, saveBlock, memory } = await loadProcessMessage(
      draft({
        intent: "edit_block",
        task_name: "giffgaff customer service",
        category: "admin",
        started_at: "2026-05-24T13:00:00.000Z",
      }),
    );
    memory.state.time_blocks.push({
      id: "block-1",
      user_id: "user-1",
      task_name: "giffgaff",
      category: "admin",
      category_id: "category-1",
      hashtags: [],
      notes: "on hold",
      started_at: "2026-05-24T12:00:00.000Z",
      ended_at: "2026-05-24T14:00:00.000Z",
      duration_seconds: 7200,
      mood: null,
      effort_level: null,
      satisfaction: null,
      avoidance_marker: false,
      hyperfocus_marker: false,
      guilt_marker: false,
      novelty_marker: false,
      created_at: "2026-05-24T12:00:00.000Z",
      updated_at: "2026-05-24T14:00:00.000Z",
    });

    const result = await processCompanionMessage({
      text: "rename it giffgaff customer service and make the start 2pm",
      relatedTimeBlockId: "block-1",
      timezone: "Europe/London",
    });

    expect(result.type).toBe("logged");
    expect(saveBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "block-1",
        task_name: "giffgaff customer service",
        category: "admin",
        category_id: "category-1",
        started_at: "2026-05-24T13:00:00.000Z",
        ended_at: "2026-05-24T14:00:00.000Z",
        note_source: "chat",
      }),
    );
  });

  it("routes activity questions to analysis even if the router says log_block", async () => {
    const { processCompanionMessage, saveBlock, startTimer } = await loadProcessMessage(
      draft({
        intent: "log_block",
        task_name: "screen time",
        duration_minutes: null,
      }),
    );

    const result = await processCompanionMessage({
      text: "how many hours did i spend on screen?",
      timezone: "Europe/London",
    });

    expect(result.type).toBe("analysis");
    expect(saveBlock).not.toHaveBeenCalled();
    expect(startTimer).not.toHaveBeenCalled();
  });

  it("starts a timer request instead of continuing an incomplete pending draft", async () => {
    const { processCompanionMessage, startTimer, saveBlock, memory } = await loadProcessMessage(
      draft({
        intent: "start_timer",
        task_name: "giffgaff customer service",
        category: "admin",
      }),
    );
    const now = new Date().toISOString();
    memory.state.companion_conversations.push({
      id: "conversation-existing",
      user_id: "user-1",
      kind: "general",
      title: "general",
      related_time_block_id: null,
      context_snapshot: { kind: "general" },
      created_at: now,
      updated_at: now,
    });
    memory.state.companion_drafts.push({
      id: "draft-existing",
      user_id: "user-1",
      conversation_id: "conversation-existing",
      status: "pending",
      draft: draft({
        task_name: "old incomplete block",
        category: "admin",
        started_at: "2026-05-24T10:00:00.000Z",
      }),
      expires_at: null,
      created_at: now,
      updated_at: now,
    });

    const result = await processCompanionMessage({
      text: "start the timer on giffgaff customer service",
      conversationId: "conversation-existing",
      timezone: "Europe/London",
    });

    expect(result.type).toBe("timer_started");
    expect(saveBlock).not.toHaveBeenCalled();
    expect(startTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        task_name: "giffgaff customer service",
        category: "admin",
      }),
    );
  });
});
