"use client";

import {
  DEMO_DEFAULT_CATEGORIES,
  demoBlockToTimeBlock,
  demoDurationSeconds,
  upsertDemoBlock,
  type DemoStoredBlock,
  type DemoStoredSession,
} from "@/lib/demo-storage";
import { defaultCategoryColor } from "@/lib/time-block-display";
import type {
  ActiveTimer,
  DeleteBlockInput,
  DeleteBlockResult,
  ResumeBlockInput,
  ResumeBlockResult,
  SaveBlockInput,
  SaveBlockResult,
  StartTimerInput,
  StartTimerResult,
  StopTimerInput,
  StopTimerResult,
  TimeBlockCategoryRecord,
} from "@/lib/types";

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugifyCategoryName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function categoryRecord(slug: string): TimeBlockCategoryRecord {
  return {
    id: slug,
    user_id: "demo",
    slug,
    name: slug.replace(/_/g, " "),
    color: defaultCategoryColor(slug),
    is_default: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function ensureCategory(
  session: DemoStoredSession,
  category: string | null | undefined,
) {
  if (!category) return session;
  if (session.categories.some((item) => item.slug === category)) return session;

  return {
    ...session,
    categories: [...session.categories, categoryRecord(category)],
  };
}

function activeBlockFromTimer(
  activeTimer: ActiveTimer & { resumed_block?: DemoStoredBlock },
): DemoStoredBlock {
  const now = new Date().toISOString();
  const base = activeTimer.resumed_block;

  return {
    id: base?.id ?? newId("demo-block"),
    user_id: "demo",
    started_at: base?.started_at ?? activeTimer.started_at,
    ended_at: null,
    duration_seconds: null,
    category_id: base?.category_id ?? base?.category ?? null,
    task_name: base?.task_name ?? null,
    category: base?.category ?? null,
    hashtags: base?.hashtags ?? [],
    notes: base?.notes ?? null,
    mood: base?.mood ?? null,
    effort_level: base?.effort_level ?? null,
    satisfaction: base?.satisfaction ?? null,
    avoidance_marker: base?.avoidance_marker ?? false,
    hyperfocus_marker: base?.hyperfocus_marker ?? false,
    guilt_marker: base?.guilt_marker ?? false,
    novelty_marker: base?.novelty_marker ?? false,
    agent_metadata: base?.agent_metadata ?? {},
    created_at: base?.created_at ?? now,
    updated_at: now,
  };
}

function blockFromSaveInput(input: SaveBlockInput, base?: DemoStoredBlock): DemoStoredBlock {
  const now = new Date().toISOString();
  const category = slugifyCategoryName(input.category);

  return {
    id: input.id ?? base?.id ?? newId("demo-block"),
    user_id: "demo",
    started_at: input.started_at,
    ended_at: input.ended_at,
    duration_seconds: demoDurationSeconds(input.started_at, input.ended_at),
    category_id: category,
    task_name: input.task_name.trim(),
    category,
    hashtags: input.hashtags ?? [],
    notes: input.notes?.trim() || null,
    mood: input.mood ?? null,
    effort_level: input.effort_level ?? null,
    satisfaction: input.satisfaction ?? null,
    avoidance_marker: input.avoidance_marker ?? false,
    hyperfocus_marker: input.hyperfocus_marker ?? false,
    guilt_marker: input.guilt_marker ?? false,
    novelty_marker: input.novelty_marker ?? false,
    agent_metadata: base?.agent_metadata ?? {},
    created_at: base?.created_at ?? now,
    updated_at: now,
  };
}

export function startDemoTimerSession(
  session: DemoStoredSession,
  input?: StartTimerInput,
): { session: DemoStoredSession; result: StartTimerResult } {
  if (session.active_timer) {
    return {
      session,
      result: { type: "already_running", activeTimer: session.active_timer },
    };
  }

  const startedAt = input?.started_at ?? new Date().toISOString();
  const activeTimer = {
    user_id: "demo",
    started_at: startedAt,
    created_at: startedAt,
  };

  return {
    session: {
      ...session,
      active_timer: activeTimer,
    },
    result: { type: "started", activeTimer },
  };
}

export function saveDemoActiveTimerDetailsSession(
  session: DemoStoredSession,
  input: StopTimerInput,
): { session: DemoStoredSession; result: SaveBlockResult } {
  if (!session.active_timer) {
    return { session, result: { type: "not_found" } };
  }

  const category = input.category ? slugifyCategoryName(input.category) : null;
  const base = activeBlockFromTimer(session.active_timer);
  const updated: DemoStoredBlock = {
    ...base,
    category_id: category,
    category,
    task_name: input.task_name?.trim() || null,
    hashtags: input.hashtags ?? [],
    notes: input.notes?.trim() || null,
    mood: input.mood ?? null,
    effort_level: input.effort_level ?? null,
    satisfaction: input.satisfaction ?? null,
    avoidance_marker: input.avoidance_marker ?? false,
    hyperfocus_marker: input.hyperfocus_marker ?? false,
    guilt_marker: input.guilt_marker ?? false,
    novelty_marker: input.novelty_marker ?? false,
    updated_at: new Date().toISOString(),
  };
  const nextSession = ensureCategory(
    {
      ...session,
      active_timer: {
        ...session.active_timer,
        resumed_block: updated,
      },
    },
    category,
  );

  return {
    session: nextSession,
    result: { type: "saved", timeBlock: demoBlockToTimeBlock(updated) },
  };
}

export function stopDemoTimerSession(
  session: DemoStoredSession,
  input?: StopTimerInput,
): { session: DemoStoredSession; result: StopTimerResult } {
  if (!session.active_timer) {
    return { session, result: { type: "not_running" } };
  }

  const now = new Date().toISOString();
  const base = activeBlockFromTimer(session.active_timer);
  const category = input?.category ? slugifyCategoryName(input.category) : base.category;
  const block: DemoStoredBlock = {
    ...base,
    ended_at: now,
    duration_seconds: demoDurationSeconds(base.started_at, now),
    category_id: category,
    category,
    task_name: input?.task_name?.trim() || base.task_name,
    hashtags: input?.hashtags ?? base.hashtags,
    notes: input?.notes?.trim() || base.notes,
    mood: input?.mood ?? base.mood,
    effort_level: input?.effort_level ?? base.effort_level,
    satisfaction: input?.satisfaction ?? base.satisfaction,
    avoidance_marker: input?.avoidance_marker ?? base.avoidance_marker,
    hyperfocus_marker: input?.hyperfocus_marker ?? base.hyperfocus_marker,
    guilt_marker: input?.guilt_marker ?? base.guilt_marker,
    novelty_marker: input?.novelty_marker ?? base.novelty_marker,
    updated_at: now,
  };

  return {
    session: ensureCategory(
      upsertDemoBlock(
        {
          ...session,
          active_timer: null,
        },
        block,
      ),
      category,
    ),
    result: { type: "stopped", timeBlock: demoBlockToTimeBlock(block) },
  };
}

export function saveDemoBlockSession(
  session: DemoStoredSession,
  input: SaveBlockInput,
): { session: DemoStoredSession; result: SaveBlockResult } {
  if (!input.task_name.trim()) {
    return { session, result: { type: "error", message: "task name is required." } };
  }

  const existing = input.id
    ? session.blocks.find((block) => block.id === input.id)
    : undefined;
  if (input.id && !existing) {
    return { session, result: { type: "not_found" } };
  }

  const block = blockFromSaveInput(input, existing);
  return {
    session: ensureCategory(upsertDemoBlock(session, block), block.category),
    result: { type: "saved", timeBlock: demoBlockToTimeBlock(block) },
  };
}

export function deleteDemoBlockSession(
  session: DemoStoredSession,
  input: DeleteBlockInput,
): { session: DemoStoredSession; result: DeleteBlockResult } {
  if (!session.blocks.some((block) => block.id === input.id)) {
    return { session, result: { type: "not_found" } };
  }

  const block_threads = { ...session.block_threads };
  delete block_threads[input.id];

  return {
    session: {
      ...session,
      blocks: session.blocks.filter((block) => block.id !== input.id),
      block_threads,
      insights: session.insights.filter((insight) => insight.time_block_id !== input.id),
    },
    result: { type: "deleted", id: input.id },
  };
}

export function resumeDemoBlockSession(
  session: DemoStoredSession,
  input: ResumeBlockInput,
): { session: DemoStoredSession; result: ResumeBlockResult } {
  if (session.active_timer) {
    return {
      session,
      result: { type: "already_running", activeTimer: session.active_timer },
    };
  }

  const block = session.blocks.find((item) => item.id === input.id);
  if (!block) {
    return { session, result: { type: "not_found" } };
  }

  const activeTimer = {
    user_id: "demo",
    started_at: block.started_at,
    created_at: new Date().toISOString(),
    resumed_block: block,
  };

  return {
    session: {
      ...session,
      active_timer: activeTimer,
      blocks: session.blocks.filter((item) => item.id !== input.id),
    },
    result: { type: "resumed", activeTimer },
  };
}

export function defaultDemoCategories() {
  return [...DEMO_DEFAULT_CATEGORIES];
}
