"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import { ActiveTimerCard } from "@/components/active-timer-card";
import { CategoryPicker } from "@/components/category-picker";
import { DailyBlocks } from "@/components/time-block-list";
import { Dropdown } from "@/components/dropdown";
import {
  createEditorState,
  createManualEditorState,
  resolveEditorCategory,
  type EditorState,
} from "@/components/time-block-helpers";
import type {
  AlibiTrackerSnapshot,
  AlibiWorkspaceStore,
} from "@/lib/alibi-workspace-store";
import type { ActiveTimer, TimeBlock, TimeBlockCategoryRecord } from "@/lib/types";
import {
  EFFORT_OPTIONS,
  FALLBACK_CATEGORIES,
  fromDateTimeLocal,
  getTodayRange,
  MOOD_OPTIONS,
  parseHashtags,
  SATISFACTION_OPTIONS,
  toDateTimeLocal,
} from "@/lib/time-block-display";

const BlockEditor = dynamic(() =>
  import("@/components/time-block-actions").then((mod) => mod.BlockEditor),
);

export interface AlibiWorkspaceControls {
  activeTimer: ActiveTimer | null;
  activeTimeBlock: TimeBlock | null;
  timeBlocks: TimeBlock[];
  categories: TimeBlockCategoryRecord[];
  pending: boolean;
  loading: boolean;
  setActiveTimer: (timer: ActiveTimer | null) => void;
  setActiveTimeBlock: (block: TimeBlock | null) => void;
  setEditor: (editor: EditorState | null) => void;
  refreshBlocks: () => Promise<void>;
  loadTracker: () => Promise<void>;
}

interface AlibiWorkspaceProps {
  store: AlibiWorkspaceStore;
  initialSnapshot: AlibiTrackerSnapshot;
  renderCompanion?: (controls: AlibiWorkspaceControls) => ReactNode;
  onSnapshotChange?: (snapshot: AlibiTrackerSnapshot) => void;
  onBlockSaved?: (block: TimeBlock) => void;
  onBlockDeleted?: (id: string) => void;
  onChatAbout?: (block: TimeBlock) => void;
  onOpenCalendar?: () => void;
}

function createActiveEditorState(
  activeTimer: ActiveTimer,
  activeTimeBlock: TimeBlock | null,
): EditorState {
  return {
    block: activeTimeBlock ?? undefined,
    isNewlyStopped: false,
    isManual: false,
    taskName: activeTimeBlock?.task_name ?? "",
    category: activeTimeBlock?.category ?? "",
    hashtags: (activeTimeBlock?.hashtags ?? []).join(" "),
    notes: activeTimeBlock?.notes ?? "",
    startedAt: toDateTimeLocal(activeTimer.started_at),
    endedAt: toDateTimeLocal(activeTimer.started_at),
    mood: activeTimeBlock?.mood ?? "",
    effortLevel: activeTimeBlock?.effort_level ?? "",
    satisfaction: activeTimeBlock?.satisfaction ?? "",
    avoidanceMarker: activeTimeBlock?.avoidance_marker ?? false,
    hyperfocusMarker: activeTimeBlock?.hyperfocus_marker ?? false,
    guiltMarker: activeTimeBlock?.guilt_marker ?? false,
    noveltyMarker: activeTimeBlock?.novelty_marker ?? false,
  };
}

function blockSaveInput(
  editor: EditorState,
  categories: TimeBlockCategoryRecord[],
) {
  const { matchedCategory, categorySlug } = resolveEditorCategory(
    editor.category,
    categories,
  );

  return {
    matchedCategory,
    categorySlug,
    input: {
      id: editor.block?.id,
      task_name: editor.taskName,
      category: categorySlug,
      category_id: matchedCategory?.id ?? null,
      started_at: fromDateTimeLocal(editor.startedAt),
      ended_at: fromDateTimeLocal(editor.endedAt),
      hashtags: parseHashtags(editor.hashtags),
      notes: editor.notes,
      mood: editor.mood || null,
      effort_level: editor.effortLevel || null,
      satisfaction: editor.satisfaction || null,
      avoidance_marker: editor.avoidanceMarker,
      hyperfocus_marker: editor.hyperfocusMarker,
      guilt_marker: editor.guiltMarker,
      novelty_marker: editor.noveltyMarker,
      note_source: "manual" as const,
    },
  };
}

function activeTimerInput(
  editor: EditorState,
  categories: TimeBlockCategoryRecord[],
) {
  const trimmedCategory = editor.category.trim();
  const resolved = trimmedCategory
    ? resolveEditorCategory(trimmedCategory, categories)
    : { matchedCategory: null, categorySlug: null };

  return {
    categorySlug: resolved.categorySlug,
    input: {
      task_name: editor.taskName,
      category: resolved.categorySlug,
      category_id: resolved.matchedCategory?.id ?? null,
      hashtags: parseHashtags(editor.hashtags),
      notes: editor.notes,
      mood: editor.mood || null,
      effort_level: editor.effortLevel || null,
      satisfaction: editor.satisfaction || null,
      avoidance_marker: editor.avoidanceMarker,
      hyperfocus_marker: editor.hyperfocusMarker,
      guilt_marker: editor.guiltMarker,
      novelty_marker: editor.noveltyMarker,
      note_source: "manual" as const,
    },
  };
}

export function AlibiWorkspace({
  store,
  initialSnapshot,
  renderCompanion,
  onSnapshotChange,
  onBlockSaved,
  onBlockDeleted,
  onChatAbout,
  onOpenCalendar,
}: AlibiWorkspaceProps) {
  const [activeTimer, setActiveTimer] = useState(initialSnapshot.activeTimer);
  const [activeTimeBlock, setActiveTimeBlock] = useState(
    initialSnapshot.activeTimeBlock,
  );
  const [timeBlocks, setTimeBlocks] = useState(initialSnapshot.timeBlocks);
  const [categories, setCategories] = useState(
    initialSnapshot.categories.length > 0
      ? initialSnapshot.categories
      : FALLBACK_CATEGORIES,
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [activeEditor, setActiveEditor] = useState<EditorState | null>(() =>
    initialSnapshot.activeTimer
      ? createActiveEditorState(
          initialSnapshot.activeTimer,
          initialSnapshot.activeTimeBlock,
        )
      : null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const today = useMemo(() => getTodayRange(), []);

  const emitSnapshot = useCallback(
    (snapshot: AlibiTrackerSnapshot) => {
      onSnapshotChange?.(snapshot);
    },
    [onSnapshotChange],
  );

  const applySnapshot = useCallback(
    (snapshot: AlibiTrackerSnapshot) => {
      setActiveTimer(snapshot.activeTimer);
      setActiveTimeBlock(snapshot.activeTimeBlock);
      setTimeBlocks(snapshot.timeBlocks);
      setCategories(
        snapshot.categories.length > 0 ? snapshot.categories : FALLBACK_CATEGORIES,
      );
      setActiveEditor(
        snapshot.activeTimer
          ? createActiveEditorState(snapshot.activeTimer, snapshot.activeTimeBlock)
          : null,
      );
      emitSnapshot(snapshot);
    },
    [emitSnapshot],
  );

  const loadTracker = useCallback(async () => {
    setError(null);
    const result = await store.loadTracker(today.input);
    if (result.type === "loaded") {
      applySnapshot(result);
      return;
    }
    setError(result.message);
  }, [applySnapshot, store, today.input]);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      setLoading(true);
      setError(null);
      const result = await store.loadTracker(today.input);
      if (result.type === "loaded") {
        applySnapshot(result);
      } else {
        setError(result.message);
      }
      if (mounted) {
        setLoading(false);
      }
    }

    hydrate();

    return () => {
      mounted = false;
    };
  }, [applySnapshot, store, today.input]);

  const refreshBlocks = useCallback(async () => {
    const result = await store.loadTracker(today.input);
    if (result.type === "loaded") {
      applySnapshot(result);
      return;
    }
    setError(result.message);
  }, [applySnapshot, store, today.input]);

  const refreshCategories = useCallback(async () => {
    const result = await store.loadCategories();
    if (result.type === "loaded") {
      setCategories(result.categories);
      emitSnapshot({
        activeTimer,
        activeTimeBlock,
        timeBlocks,
        categories: result.categories,
      });
    }
  }, [activeTimeBlock, activeTimer, emitSnapshot, store, timeBlocks]);

  const handleStart = () => {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await store.startTimer();
      if (result.type === "started" || result.type === "already_running") {
        const snapshot = {
          activeTimer: result.activeTimer,
          activeTimeBlock: null,
          timeBlocks,
          categories,
        };
        applySnapshot(snapshot);
        return;
      }
      setError(result.message);
    });
  };

  const handleStop = () => {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await store.stopTimer();
      if (result.type === "stopped") {
        setActiveTimer(null);
        setActiveTimeBlock(null);
        setActiveEditor(null);
        setEditor(createEditorState(result.timeBlock, true));
        onBlockSaved?.(result.timeBlock);
        await refreshBlocks();
        return;
      }
      if (result.type === "not_running") {
        setActiveTimer(null);
        setActiveTimeBlock(null);
        setActiveEditor(null);
        setError("no timer is running.");
        await refreshBlocks();
        return;
      }
      if (result.timeBlock) {
        setEditor(createEditorState(result.timeBlock, true));
        onBlockSaved?.(result.timeBlock);
        await loadTracker();
      }
      setError(result.message);
    });
  };

  const handleSaveActiveTimer = () => {
    const saveActiveTimerDetails = store.saveActiveTimerDetails;
    if (!activeEditor || !saveActiveTimerDetails) return;

    setError(null);
    setStatus(null);
    startTransition(async () => {
      const { categorySlug, input } = activeTimerInput(activeEditor, categories);
      if (activeEditor.category.trim() && !categorySlug) {
        setError("category is invalid.");
        return;
      }

      const result = await saveActiveTimerDetails(input);
      if (result.type === "saved") {
        setActiveTimeBlock(result.timeBlock);
        setActiveEditor(
          activeTimer ? createActiveEditorState(activeTimer, result.timeBlock) : null,
        );
        await refreshCategories();
        setStatus("timer details saved.");
        emitSnapshot({
          activeTimer,
          activeTimeBlock: result.timeBlock,
          timeBlocks,
          categories,
        });
        return;
      }
      setError(
        result.type === "not_found"
          ? "no timer is running."
          : result.message,
      );
    });
  };

  const handleSave = () => {
    if (!editor) return;

    setError(null);
    setStatus(null);
    startTransition(async () => {
      if (!editor.taskName.trim()) {
        setError("task name is required.");
        return;
      }

      if (!editor.category) {
        setError("category is required.");
        return;
      }

      const startedAt = new Date(editor.startedAt);
      const endedAt = new Date(editor.endedAt);

      if (
        Number.isNaN(startedAt.getTime()) ||
        Number.isNaN(endedAt.getTime()) ||
        endedAt.getTime() <= startedAt.getTime()
      ) {
        setError("end time must be after start time.");
        return;
      }

      const { categorySlug, input } = blockSaveInput(editor, categories);
      if (!categorySlug) {
        setError("category is invalid.");
        return;
      }

      const result = await store.saveBlock(input);
      if (result.type === "saved") {
        setEditor(null);
        onBlockSaved?.(result.timeBlock);
        await Promise.all([refreshBlocks(), refreshCategories()]);
        return;
      }
      setError(
        result.type === "not_found"
          ? "time block was not found."
          : result.message,
      );
    });
  };

  const handleDelete = (block: TimeBlock) => {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await store.deleteBlock({ id: block.id });
      if (result.type === "deleted") {
        if (editor?.block?.id === block.id) setEditor(null);
        onBlockDeleted?.(block.id);
        await refreshBlocks();
        return;
      }
      setError(
        result.type === "not_found"
          ? "time block was not found."
          : result.message,
      );
    });
  };

  const handleResume = (block: TimeBlock) => {
    setError(null);
    setStatus(null);
    setEditor(null);
    startTransition(async () => {
      const result = await store.resumeBlock({ id: block.id });
      if (result.type === "resumed" || result.type === "already_running") {
        setActiveTimer(result.activeTimer);
        await refreshBlocks();
        return;
      }
      setError(
        result.type === "not_found"
          ? "time block was not found."
          : result.message,
      );
    });
  };

  const controls: AlibiWorkspaceControls = {
    activeTimer,
    activeTimeBlock,
    timeBlocks,
    categories,
    pending: isPending,
    loading,
    setActiveTimer,
    setActiveTimeBlock,
    setEditor,
    refreshBlocks,
    loadTracker,
  };

  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <ActiveTimerCard
          activeTimer={activeTimer}
          loading={loading}
          pending={isPending}
          onStart={handleStart}
          onStop={handleStop}
          onRefresh={() => {
            setLoading(true);
            loadTracker().finally(() => setLoading(false));
          }}
        >
          {activeTimer && activeEditor && (
            <ActiveTimerDetailsEditor
              editor={activeEditor}
              setEditor={setActiveEditor}
              categories={categories}
              pending={isPending}
              canSave={Boolean(store.saveActiveTimerDetails)}
              onSave={handleSaveActiveTimer}
            />
          )}
        </ActiveTimerCard>

        {error && (
          <div role="alert" className="alibi-banner-error">
            {error}
          </div>
        )}

        {status && <div className="alibi-banner-info">{status}</div>}

        {editor && (
          <BlockEditor
            editor={editor}
            categories={categories}
            setEditor={setEditor}
            onSave={handleSave}
            onDelete={editor.block ? () => handleDelete(editor.block!) : undefined}
            pending={isPending}
          />
        )}

        {renderCompanion?.(controls)}
      </div>

      <DailyBlocks
        date={today.start}
        loading={loading}
        blocks={timeBlocks}
        categories={categories}
        canResume={activeTimer === null}
        onAdd={() => setEditor(createManualEditorState())}
        onEdit={(block) => setEditor(createEditorState(block))}
        onDelete={handleDelete}
        onResume={handleResume}
        onChatAbout={onChatAbout}
        pending={isPending}
        {...(onOpenCalendar ? { onOpenCalendar } : {})}
      />
    </section>
  );
}

function ActiveTimerDetailsEditor({
  editor,
  setEditor,
  categories,
  pending,
  canSave,
  onSave,
}: {
  editor: EditorState;
  setEditor: (editor: EditorState) => void;
  categories: TimeBlockCategoryRecord[];
  pending: boolean;
  canSave: boolean;
  onSave: () => void;
}) {
  return (
    <div className="alibi-inset mt-5 grid gap-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          task
          <input
            value={editor.taskName}
            onChange={(event) => setEditor({ ...editor, taskName: event.target.value })}
            className="alibi-input h-11"
            placeholder="specific activity name: client deck edits, invoice batch, TikTok captions"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          category
          <CategoryPicker
            value={editor.category}
            categories={categories}
            onChange={(val) =>
              setEditor({
                ...editor,
                category: val as EditorState["category"],
              })
            }
          />
        </label>
      </div>

      <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
        hashtags
        <input
          value={editor.hashtags}
          onChange={(event) => setEditor({ ...editor, hashtags: event.target.value })}
          className="alibi-input h-10"
          placeholder="project, client, context, energy, platform"
        />
      </label>

      <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
        notes
        <textarea
          value={editor.notes}
          onChange={(event) => setEditor({ ...editor, notes: event.target.value })}
          className="alibi-input min-h-20 resize-y py-2"
          placeholder="what happened, what got in the way, how it felt, what changed, and what alibi should remember"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          mood
          <Dropdown
            value={editor.mood}
            options={MOOD_OPTIONS}
            onChange={(val) =>
              setEditor({ ...editor, mood: val as EditorState["mood"] })
            }
            placeholder="unset"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          effort
          <Dropdown
            value={editor.effortLevel}
            options={EFFORT_OPTIONS}
            onChange={(val) =>
              setEditor({
                ...editor,
                effortLevel: val as EditorState["effortLevel"],
              })
            }
            placeholder="unset"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          satisfaction
          <Dropdown
            value={editor.satisfaction}
            options={SATISFACTION_OPTIONS}
            onChange={(val) =>
              setEditor({
                ...editor,
                satisfaction: val as EditorState["satisfaction"],
              })
            }
            placeholder="unset"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            ["avoidanceMarker", "avoidance"],
            ["hyperfocusMarker", "hyperfocus"],
            ["guiltMarker", "guilt"],
            ["noveltyMarker", "novelty"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-alibi-lavender/40 bg-white px-3 text-xs font-black text-alibi-teal"
            >
              <input
                type="checkbox"
                checked={Boolean(editor[key as keyof EditorState])}
                onChange={(event) =>
                  setEditor({ ...editor, [key]: event.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !canSave}
          className="alibi-button-teal inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          save
        </button>
      </div>
    </div>
  );
}
