"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import {
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";
import {
  getCompanionThread,
  processCompanionMessage,
} from "@/app/actions/process-message";
import {
  deleteBlock,
  getActiveTimer,
  getCategories,
  getCalendarData,
  resumeBlock,
  saveBlock,
  startTimer,
  stopTimer,
} from "@/app/actions/timer";
import type {
  ActiveTimer,
  CompanionThreadState,
  TimeBlock,
  TimeBlockCategoryRecord,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { DailyBlocks as SharedDailyBlocks } from "@/components/time-block-list";
import {
  companionMessageToChatMessage as sharedCompanionMessageToChatMessage,
  createEditorState as createSharedEditorState,
  createManualEditorState as createSharedManualEditorState,
  resolveEditorCategory,
  type ChatMessage,
  type EditorState,
} from "@/components/time-block-helpers";
import {
  clearDemoSession,
  readDemoSession,
  type DemoStoredBlock,
} from "@/lib/demo-storage";
import {
  FALLBACK_CATEGORIES,
  formatDateHeading,
  formatElapsed,
  formatTime,
  fromDateTimeLocal,
  getElapsedSeconds,
  getTodayRange,
  parseHashtags,
} from "@/lib/time-block-display";

interface TimerTrackerAppProps {
  initialActiveTimer: ActiveTimer | null;
  initialCategories: TimeBlockCategoryRecord[];
  initialCompanionThread?: CompanionThreadState;
}

const SharedBlockEditor = dynamic(() =>
  import("@/components/time-block-actions").then((mod) => mod.BlockEditor),
);
const SharedCompanionChatPanel = dynamic(() =>
  import("@/components/time-block-actions").then(
    (mod) => mod.CompanionChatPanel,
  ),
);

export function TimerTrackerApp({
  initialActiveTimer,
  initialCategories,
  initialCompanionThread,
}: TimerTrackerAppProps) {
  const [activeTimer, setActiveTimer] =
    useState<ActiveTimer | null>(initialActiveTimer);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [categories, setCategories] =
    useState<TimeBlockCategoryRecord[]>(
      initialCategories.length > 0 ? initialCategories : FALLBACK_CATEGORIES,
    );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [activeCompanionThread, setActiveCompanionThread] =
    useState<CompanionThreadState | null>(initialCompanionThread ?? null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    (initialCompanionThread?.messages ?? []).map(
      sharedCompanionMessageToChatMessage,
    ),
  );
  const [demoImportBlocks, setDemoImportBlocks] = useState<DemoStoredBlock[]>(
    [],
  );
  const [demoImportName, setDemoImportName] = useState<string | null>(null);
  const [isImportingDemo, setIsImportingDemo] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isChatPending, startChatTransition] = useTransition();

  const today = useMemo(() => getTodayRange(), []);

  const loadTracker = useCallback(async () => {
    setError(null);
    const [timerResult, calendarResult, categoriesResult] = await Promise.all([
      getActiveTimer(),
      getCalendarData(today.input),
      getCategories(),
    ]);

    if (timerResult.type === "loaded") {
      setActiveTimer(timerResult.activeTimer);
    } else {
      setError(timerResult.message);
    }

    if (calendarResult.type === "loaded") {
      setTimeBlocks(calendarResult.timeBlocks);
    } else {
      setError(calendarResult.message);
    }

    if (categoriesResult.type === "loaded") {
      setCategories(categoriesResult.categories);
    } else {
      setError(categoriesResult.message);
    }
  }, [today.input]);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      setLoading(true);
      await loadTracker();
      if (mounted) {
        setLoading(false);
      }
    }

    hydrate();

    return () => {
      mounted = false;
    };
  }, [loadTracker]);

  useEffect(() => {
    const demoSession = readDemoSession();
    const importableBlocks =
      demoSession?.blocks.filter(
        (block) => block.ended_at && block.task_name && block.category,
      ) ?? [];

    if (demoSession && importableBlocks.length > 0) {
      setDemoImportName(demoSession.name);
      setDemoImportBlocks(importableBlocks);
    }
  }, []);

  const refreshBlocks = useCallback(async () => {
    const result = await getCalendarData(today.input);

    if (result.type === "loaded") {
      setTimeBlocks(result.timeBlocks);
      return;
    }

    setError(result.message);
  }, [today.input]);

  const handleStart = () => {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await startTimer();

      if (result.type === "started" || result.type === "already_running") {
        setActiveTimer(result.activeTimer);
        return;
      }

      setError(result.message);
    });
  };

  const handleStop = () => {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await stopTimer();

      if (result.type === "stopped") {
        setActiveTimer(null);
        setEditor(createSharedEditorState(result.timeBlock, true));
        await refreshBlocks();
        return;
      }

      if (result.type === "not_running") {
        setActiveTimer(null);
        setError("no timer is running.");
        await refreshBlocks();
        return;
      }

      if (result.timeBlock) {
        setEditor(createSharedEditorState(result.timeBlock, true));
        await loadTracker();
      }

      setError(result.message);
    });
  };

  const handleSave = () => {
    if (!editor) {
      return;
    }

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

      const { matchedCategory, categorySlug } = resolveEditorCategory(
        editor.category,
        categories,
      );

      if (!categorySlug) {
        setError("category is invalid.");
        return;
      }

      const result = await saveBlock({
        id: editor.block?.id,
        task_name: editor.taskName,
        category: categorySlug,
        category_id: matchedCategory?.id ?? null,
        started_at: fromDateTimeLocal(editor.startedAt),
        ended_at: fromDateTimeLocal(editor.endedAt),
        hashtags: parseHashtags(editor.hashtags),
        notes: editor.notes,
        note_source: "manual",
      });

      if (result.type === "saved") {
        setEditor(null);
        setStatus(null);
        await Promise.all([
          refreshBlocks(),
          getCategories().then((categoriesResult) => {
            if (categoriesResult.type === "loaded") {
              setCategories(categoriesResult.categories);
            }
          }),
        ]);
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
      const result = await deleteBlock({ id: block.id });

      if (result.type === "deleted") {
        if (editor?.block?.id === block.id) {
          setEditor(null);
        }

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
      const result = await resumeBlock({ id: block.id });

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

  const handleImportDemoBlocks = async () => {
    if (demoImportBlocks.length === 0 || isImportingDemo) {
      return;
    }

    setError(null);
    setIsImportingDemo(true);

    for (const block of demoImportBlocks) {
      if (!block.ended_at || !block.task_name || !block.category) {
        continue;
      }

      const result = await saveBlock({
        task_name: block.task_name,
        category: block.category,
        started_at: block.started_at,
        ended_at: block.ended_at,
        hashtags: block.hashtags,
        notes: block.notes,
        note_source: "manual",
      });

      if (result.type !== "saved") {
        setError(
          result.type === "not_found"
            ? "time block was not found."
            : result.message,
        );
        setIsImportingDemo(false);
        return;
      }
    }

    clearDemoSession();
    setDemoImportBlocks([]);
    setDemoImportName(null);
    setIsImportingDemo(false);
    await Promise.all([
      refreshBlocks(),
      getCategories().then((categoriesResult) => {
        if (categoriesResult.type === "loaded") {
          setCategories(categoriesResult.categories);
        }
      }),
    ]);
  };

  const showCompanionThread = useCallback((thread: CompanionThreadState) => {
    setActiveCompanionThread(thread);
    setChatMessages(thread.messages.map(sharedCompanionMessageToChatMessage));
  }, []);

  const handleOpenGeneralCompanionThread = useCallback(async () => {
    const thread = await getCompanionThread();
    if (thread) {
      showCompanionThread(thread);
    }
  }, [showCompanionThread]);

  const handleChatAboutBlock = useCallback(
    async (block: TimeBlock) => {
      if (isChatPending) {
        return;
      }

      startChatTransition(async () => {
        const thread = await getCompanionThread({
          relatedTimeBlockId: block.id,
        });
        if (thread) {
          showCompanionThread(thread);
        } else {
          setError("couldn't open that companion thread.");
        }
      });
    },
    [isChatPending, showCompanionThread],
  );

  const handleCompanionMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isChatPending) {
        return;
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: trimmed,
        createdAt: new Date().toISOString(),
      };

      setChatMessages((messages) => [...messages, userMessage]);
      setError(null);
      setStatus(null);

      startChatTransition(async () => {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const result = await processCompanionMessage({
          text: trimmed,
          timezone,
          conversationId: activeCompanionThread?.conversation.id ?? null,
        });

        const addAssistantMessage = (text: string) => {
          setChatMessages((messages) => [
            ...messages,
            {
              id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              role: "assistant",
              text,
              createdAt: new Date().toISOString(),
            },
          ]);
        };
        const reconcileMessages = () => {
          if (Array.isArray(result.messages) && result.messages.length > 0) {
            setChatMessages(
              result.messages.map(sharedCompanionMessageToChatMessage),
            );
          }
          setActiveCompanionThread({
            conversation: result.conversation,
            messages: result.messages,
            hasPendingDraft: result.hasPendingDraft,
          });
        };

        if (result.type === "error") {
          reconcileMessages();
          if (!Array.isArray(result.messages) || result.messages.length === 0) {
            addAssistantMessage(result.message);
          }
          return;
        }

        if (result.type === "clarify") {
          reconcileMessages();
          return;
        }

        reconcileMessages();

        if (
          result.type === "timer_started" ||
          result.type === "timer_already_running"
        ) {
          setActiveTimer(result.activeTimer);
          return;
        }

        if (result.type === "timer_stopped") {
          setActiveTimer(null);
          setEditor(
            createSharedEditorState(
              result.timeBlock,
              !result.timeBlock.task_name,
            ),
          );
          await refreshBlocks();
          return;
        }

        if (result.type === "logged") {
          await refreshBlocks();
          const loggedStart = new Date(result.timeBlock.started_at).getTime();
          const isVisibleToday =
            Number.isFinite(loggedStart) &&
            loggedStart >= today.start.getTime() &&
            loggedStart < today.end.getTime();

          if (!isVisibleToday) {
            setStatus(
              `saved for ${formatDateHeading(new Date(result.timeBlock.started_at))}. it is in the dashboard/calendar for that day, not in today's list.`,
            );
          }
          return;
        }
      });
    },
    [
      activeCompanionThread?.conversation.id,
      isChatPending,
      refreshBlocks,
      today.end,
      today.start,
    ],
  );

  return (
    <>
        {demoImportBlocks.length > 0 && (
          <section className="alibi-banner-info">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-alibi-blue">
                  import your demo blocks
                </p>
                <p className="mt-1 text-sm font-semibold leading-6 text-alibi-teal">
                  {demoImportName
                    ? `${demoImportName}'s demo session`
                    : "your demo session"}{" "}
                  has {demoImportBlocks.length} completed block
                  {demoImportBlocks.length === 1 ? "" : "s"} ready to save into
                  this account.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDemoImportBlocks([]);
                    setDemoImportName(null);
                  }}
                  className="h-10 rounded-2xl px-4 text-sm font-bold text-alibi-teal transition hover:bg-alibi-lavender/15 hover:text-alibi-pink"
                >
                  not now
                </button>
                <button
                  type="button"
                  onClick={handleImportDemoBlocks}
                  disabled={isImportingDemo}
                  className="alibi-button-teal inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
                >
                  {isImportingDemo && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  import
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <div className="flex flex-col gap-5">
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
            />

            {error && (
              <div
                role="alert"
                className="alibi-banner-error"
              >
                {error}
              </div>
            )}

            {status && <div className="alibi-banner-info">{status}</div>}

            {editor && (
              <SharedBlockEditor
                editor={editor}
                categories={categories}
                setEditor={setEditor}
                onSave={handleSave}
                onDelete={
                  editor.block ? () => handleDelete(editor.block!) : undefined
                }
                pending={isPending}
              />
            )}

            <SharedCompanionChatPanel
              threadKind={activeCompanionThread?.conversation.kind ?? "general"}
              threadTitle={activeCompanionThread?.conversation.title ?? null}
              messages={chatMessages}
              pending={isChatPending}
              onOpenGeneral={handleOpenGeneralCompanionThread}
              onSubmit={handleCompanionMessage}
            />
          </div>

          <SharedDailyBlocks
            date={today.start}
            loading={loading}
            blocks={timeBlocks}
            categories={categories}
            canResume={activeTimer === null}
            onAdd={() => setEditor(createSharedManualEditorState())}
            onEdit={(block) => setEditor(createSharedEditorState(block))}
            onDelete={handleDelete}
            onResume={handleResume}
            onChatAbout={handleChatAboutBlock}
            pending={isPending}
          />
        </section>
    </>
  );
}

function ActiveTimerCard({
  activeTimer,
  loading,
  pending,
  onStart,
  onStop,
  onRefresh,
}: {
  activeTimer: ActiveTimer | null;
  loading: boolean;
  pending: boolean;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const elapsed = getElapsedSeconds(activeTimer, now);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="alibi-card-pop relative overflow-hidden p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            active timer
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-normal text-alibi-blue sm:text-5xl">
            {formatElapsed(elapsed)}
          </h1>
        </div>
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl border",
            activeTimer
              ? "border-alibi-pink/25 bg-alibi-pink/15 text-alibi-pink"
              : "border-alibi-teal/20 bg-alibi-teal/10 text-alibi-teal",
          )}
        >
          <Clock className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        {activeTimer ? (
          <button
            type="button"
            onClick={onStop}
            disabled={pending}
            className="alibi-button-stop inline-flex h-11 min-w-32 items-center justify-center gap-2 px-4 text-sm font-black"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={pending || loading}
            className="alibi-button-primary inline-flex h-11 min-w-32 items-center justify-center gap-2 text-sm"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            start
          </button>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={pending || loading}
          aria-label="refresh timer and blocks"
          title="refresh"
          className="alibi-button-secondary inline-flex h-11 w-11 items-center justify-center"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>

      <p className="relative mt-4 text-sm font-medium leading-6 text-alibi-teal">
        {activeTimer
          ? `running since ${formatTime(activeTimer.started_at)}`
          : "start when you begin, stop when the block is real."}
      </p>
    </section>
  );
}
