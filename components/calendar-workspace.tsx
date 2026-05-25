"use client";

import { useCallback, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  getCompanionThread,
  processCompanionMessage,
} from "@/app/actions/process-message";
import {
  deleteBlock,
  getCalendarData,
  getCategories,
  saveBlock,
} from "@/app/actions/timer";
import { CalendarView } from "@/components/dashboard/calendar-view";
import { TimeBlockItem } from "@/components/time-block-list";
import {
  companionMessageToChatMessage,
  createEditorState,
  resolveEditorCategory,
  type ChatMessage,
  type EditorState,
} from "@/components/time-block-helpers";
import type {
  CompanionThreadState,
  TimeBlock,
  TimeBlockCategoryRecord,
} from "@/lib/types";
import {
  fromDateTimeLocal,
  parseHashtags,
  withDistinctCategoryColors,
} from "@/lib/time-block-display";

interface CalendarWorkspaceProps {
  initialBlocks: TimeBlock[];
  initialCategories: TimeBlockCategoryRecord[];
  initialCompanionThread?: CompanionThreadState;
}

type ActivePanel = "edit" | "chat" | null;

const BlockEditor = dynamic(() =>
  import("@/components/time-block-actions").then((mod) => mod.BlockEditor),
);
const CompanionChatPanel = dynamic(() =>
  import("@/components/time-block-actions").then(
    (mod) => mod.CompanionChatPanel,
  ),
);

export function CalendarWorkspace({
  initialBlocks,
  initialCategories,
  initialCompanionThread,
}: CalendarWorkspaceProps) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [categories, setCategories] = useState(() =>
    withDistinctCategoryColors(initialCategories),
  );
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [thread, setThread] = useState<CompanionThreadState | null>(
    initialCompanionThread ?? null,
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    (initialCompanionThread?.messages ?? []).map(
      companionMessageToChatMessage,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isChatPending, startChatTransition] = useTransition();
  const [isMonthPending, startMonthTransition] = useTransition();

  const replaceBlock = useCallback((block: TimeBlock) => {
    setBlocks((current) =>
      current
        .map((item) => (item.id === block.id ? block : item))
        .concat(current.some((item) => item.id === block.id) ? [] : [block])
        .sort(
          (a, b) =>
            new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
        ),
    );
    setSelectedBlock(block);
  }, []);

  const refreshCategories = useCallback(async () => {
    const result = await getCategories();
    if (result.type === "loaded") {
      setCategories(result.categories);
    }
  }, []);

  const handleMonthChange = useCallback((range: { start: string; end: string }) => {
    setError(null);
    startMonthTransition(async () => {
      const result = await getCalendarData(range);
      if (result.type === "loaded") {
        setBlocks(result.timeBlocks);
        setSelectedBlock(null);
        setEditor(null);
        setActivePanel(null);
        return;
      }

      setError(result.message);
    });
  }, []);

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
        mood: editor.mood || null,
        effort_level: editor.effortLevel || null,
        satisfaction: editor.satisfaction || null,
        avoidance_marker: editor.avoidanceMarker,
        hyperfocus_marker: editor.hyperfocusMarker,
        guilt_marker: editor.guiltMarker,
        novelty_marker: editor.noveltyMarker,
        note_source: "manual",
      });

      if (result.type === "saved") {
        replaceBlock(result.timeBlock);
        setEditor(null);
        setActivePanel(null);
        await refreshCategories();
        router.refresh();
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
        setBlocks((current) => current.filter((item) => item.id !== block.id));
        if (selectedBlock?.id === block.id) setSelectedBlock(null);
        if (editor?.block?.id === block.id) setEditor(null);
        setActivePanel(null);
        router.refresh();
        return;
      }

      setError(
        result.type === "not_found"
          ? "time block was not found."
          : result.message,
      );
    });
  };

  const showThread = useCallback((nextThread: CompanionThreadState) => {
    setThread(nextThread);
    setChatMessages(nextThread.messages.map(companionMessageToChatMessage));
  }, []);

  const handleOpenGeneralThread = useCallback(async () => {
    const nextThread = await getCompanionThread();
    if (nextThread) showThread(nextThread);
  }, [showThread]);

  const handleChatAbout = useCallback(
    async (block: TimeBlock) => {
      if (isChatPending) return;

      setError(null);
      setStatus(null);
      startChatTransition(async () => {
        const nextThread = await getCompanionThread({
          relatedTimeBlockId: block.id,
        });
        if (nextThread) {
          showThread(nextThread);
          setActivePanel("chat");
        } else {
          setError("couldn't open that companion thread.");
        }
      });
    },
    [isChatPending, showThread],
  );

  const handleCompanionMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isChatPending) return;

      setChatMessages((messages) => [
        ...messages,
        {
          id: `user-${Date.now()}`,
          role: "user",
          text: trimmed,
          createdAt: new Date().toISOString(),
        },
      ]);
      setError(null);
      setStatus(null);

      startChatTransition(async () => {
        const result = await processCompanionMessage({
          text: trimmed,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          conversationId: thread?.conversation.id ?? null,
        });

        const reconcileMessages = () => {
          if (Array.isArray(result.messages) && result.messages.length > 0) {
            setChatMessages(result.messages.map(companionMessageToChatMessage));
          }
          setThread({
            conversation: result.conversation,
            messages: result.messages,
            hasPendingDraft: result.hasPendingDraft,
          });
        };

        if (result.type === "error") {
          reconcileMessages();
          if (!Array.isArray(result.messages) || result.messages.length === 0) {
            setChatMessages((messages) => [
              ...messages,
              {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                text: result.message,
                createdAt: new Date().toISOString(),
              },
            ]);
          }
          return;
        }

        reconcileMessages();

        if (result.type === "timer_stopped" || result.type === "logged") {
          replaceBlock(result.timeBlock);
          router.refresh();
        }
      });
    },
    [isChatPending, replaceBlock, router, thread?.conversation.id],
  );

  const handleCalendarSelectedBlockChange = useCallback(
    (block: TimeBlock | null) => {
      if (block && selectedBlock?.id !== block.id) {
        setEditor(null);
        setActivePanel(null);
      }
      setSelectedBlock(block);
      if (!block) {
        setEditor(null);
        setActivePanel(null);
      }
    },
    [selectedBlock?.id],
  );

  const handleEditBlock = useCallback((block: TimeBlock) => {
    setEditor(createEditorState(block));
    setActivePanel("edit");
  }, []);

  const handleCloseEditor = useCallback((nextEditor: EditorState | null) => {
    setEditor(nextEditor);
    if (!nextEditor) {
      setActivePanel(null);
    }
  }, []);

  const detailSlot =
    selectedBlock && activePanel === "edit" && editor ? (
      <BlockEditor
        editor={editor}
        categories={categories}
        setEditor={handleCloseEditor}
        onSave={handleSave}
        onDelete={editor.block ? () => handleDelete(editor.block!) : undefined}
        pending={isPending}
      />
    ) : selectedBlock && activePanel === "chat" ? (
      <CompanionChatPanel
        threadKind={thread?.conversation.kind ?? "general"}
        threadTitle={thread?.conversation.title ?? null}
        messages={chatMessages}
        pending={isChatPending}
        onOpenGeneral={handleOpenGeneralThread}
        onSubmit={handleCompanionMessage}
        onClose={() => setActivePanel(null)}
      />
    ) : selectedBlock ? (
      <TimeBlockItem
        block={selectedBlock}
        categories={categories}
        onChatAbout={handleChatAbout}
        onEdit={handleEditBlock}
        onDelete={handleDelete}
        pending={isPending}
      />
    ) : null;

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="alibi-banner-error">
          {error}
        </div>
      )}
      {status && <div className="alibi-banner-info">{status}</div>}
      {isMonthPending && (
        <div className="alibi-banner-info">loading that month.</div>
      )}

      <CalendarView
        blocks={blocks}
        categories={categories}
        detailSlot={detailSlot}
        detailMode={selectedBlock ? "expanded" : "default"}
        onSelectedBlockChange={handleCalendarSelectedBlockChange}
        onMonthChange={handleMonthChange}
      />
    </div>
  );
}
