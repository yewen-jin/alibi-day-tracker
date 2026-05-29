"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  getCompanionThread,
  processCompanionMessage,
} from "@/app/actions/process-message";
import { saveBlock } from "@/app/actions/timer";
import { AlibiWorkspace, type AlibiWorkspaceControls } from "@/components/alibi-workspace";
import {
  companionMessageToChatMessage,
  createEditorState,
  type ChatMessage,
} from "@/components/time-block-helpers";
import { createAuthenticatedAlibiWorkspaceStore } from "@/lib/authenticated-alibi-workspace-store";
import {
  clearDemoSession,
  readDemoSession,
  type DemoStoredBlock,
} from "@/lib/demo-storage";
import { isDemoSeedBlock } from "@/lib/demo-seed-data";
import type {
  ActiveTimer,
  CompanionThreadState,
  TimeBlock,
  TimeBlockCategoryRecord,
} from "@/lib/types";
import { formatDateHeading, getTodayRange } from "@/lib/time-block-display";

interface TimerTrackerAppProps {
  initialActiveTimer: ActiveTimer | null;
  initialCategories: TimeBlockCategoryRecord[];
  initialCompanionThread?: CompanionThreadState;
}

const CompanionChatPanel = dynamic(() =>
  import("@/components/time-block-actions").then(
    (mod) => mod.CompanionChatPanel,
  ),
);

export function TimerTrackerApp({
  initialActiveTimer,
  initialCategories,
  initialCompanionThread,
}: TimerTrackerAppProps) {
  const store = useMemo(() => createAuthenticatedAlibiWorkspaceStore(), []);
  const latestControlsRef = useRef<AlibiWorkspaceControls | null>(null);
  const today = useMemo(() => getTodayRange(), []);
  const [activeCompanionThread, setActiveCompanionThread] =
    useState<CompanionThreadState | null>(initialCompanionThread ?? null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    (initialCompanionThread?.messages ?? []).map(companionMessageToChatMessage),
  );
  const [demoImportBlocks, setDemoImportBlocks] = useState<DemoStoredBlock[]>([]);
  const [demoImportName, setDemoImportName] = useState<string | null>(null);
  const [isImportingDemo, setIsImportingDemo] = useState(false);
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatPending, startChatTransition] = useTransition();

  useEffect(() => {
    const demoSession = readDemoSession();
    const importableBlocks =
      demoSession?.blocks.filter(
        (block) =>
          !isDemoSeedBlock(block) &&
          block.ended_at &&
          block.task_name &&
          block.category,
      ) ?? [];

    if (demoSession && importableBlocks.length > 0) {
      setDemoImportName(demoSession.name);
      setDemoImportBlocks(importableBlocks);
    }
  }, []);

  const showCompanionThread = useCallback((thread: CompanionThreadState) => {
    setActiveCompanionThread(thread);
    setChatMessages(thread.messages.map(companionMessageToChatMessage));
  }, []);

  const handleOpenGeneralCompanionThread = useCallback(async () => {
    const thread = await getCompanionThread();
    if (thread) {
      showCompanionThread(thread);
    }
  }, [showCompanionThread]);

  const handleChatAboutBlock = useCallback(
    async (block: TimeBlock) => {
      if (isChatPending) return;

      setChatError(null);
      startChatTransition(async () => {
        const thread = await getCompanionThread({
          relatedTimeBlockId: block.id,
        });
        if (thread) {
          showCompanionThread(thread);
        } else {
          setChatError("couldn't open that companion thread.");
        }
      });
    },
    [isChatPending, showCompanionThread],
  );

  const handleCompanionMessage = useCallback(
    async (text: string, controls: AlibiWorkspaceControls) => {
      const trimmed = text.trim();
      if (!trimmed || isChatPending) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: trimmed,
        createdAt: new Date().toISOString(),
      };

      setChatMessages((messages) => [...messages, userMessage]);
      setChatError(null);
      setChatStatus(null);

      startChatTransition(async () => {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const result = await processCompanionMessage({
          text: trimmed,
          timezone,
          conversationId: activeCompanionThread?.conversation.id ?? null,
        });

        const addAssistantMessage = (message: string) => {
          setChatMessages((messages) => [
            ...messages,
            {
              id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              role: "assistant",
              text: message,
              createdAt: new Date().toISOString(),
            },
          ]);
        };
        const reconcileMessages = () => {
          if (Array.isArray(result.messages) && result.messages.length > 0) {
            setChatMessages(result.messages.map(companionMessageToChatMessage));
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
          controls.setActiveTimer(result.activeTimer);
          return;
        }

        if (result.type === "timer_stopped") {
          controls.setActiveTimer(null);
          controls.setActiveTimeBlock(null);
          controls.setEditor(
            createEditorState(result.timeBlock, !result.timeBlock.task_name),
          );
          await controls.refreshBlocks();
          return;
        }

        if (result.type === "logged") {
          await controls.refreshBlocks();
          const loggedStart = new Date(result.timeBlock.started_at).getTime();
          const isVisibleToday =
            Number.isFinite(loggedStart) &&
            loggedStart >= today.start.getTime() &&
            loggedStart < today.end.getTime();

          if (!isVisibleToday) {
            setChatStatus(
              `saved for ${formatDateHeading(new Date(result.timeBlock.started_at))}. it is in the dashboard/calendar for that day, not in today's list.`,
            );
          }
        }
      });
    },
    [
      activeCompanionThread?.conversation.id,
      isChatPending,
      today.end,
      today.start,
    ],
  );

  const handleImportDemoBlocks = async () => {
    if (demoImportBlocks.length === 0 || isImportingDemo) return;

    setChatError(null);
    setIsImportingDemo(true);

    for (const block of demoImportBlocks) {
      if (!block.ended_at || !block.task_name || !block.category) continue;

      const result = await saveBlock({
        task_name: block.task_name,
        category: block.category,
        started_at: block.started_at,
        ended_at: block.ended_at,
        hashtags: block.hashtags,
        notes: block.notes,
        mood: block.mood,
        effort_level: block.effort_level,
        satisfaction: block.satisfaction,
        avoidance_marker: block.avoidance_marker,
        hyperfocus_marker: block.hyperfocus_marker,
        guilt_marker: block.guilt_marker,
        novelty_marker: block.novelty_marker,
        note_source: "manual",
      });

      if (result.type !== "saved") {
        setChatError(
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
    await latestControlsRef.current?.loadTracker();
  };

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
                {isImportingDemo && <Loader2 className="h-4 w-4 animate-spin" />}
                import
              </button>
            </div>
          </div>
        </section>
      )}

      {chatError && (
        <div role="alert" className="alibi-banner-error">
          {chatError}
        </div>
      )}

      <AlibiWorkspace
        store={store}
        initialSnapshot={{
          activeTimer: initialActiveTimer,
          activeTimeBlock: null,
          timeBlocks: [],
          categories: initialCategories,
        }}
        onChatAbout={handleChatAboutBlock}
        renderCompanion={(controls) => {
          latestControlsRef.current = controls;
          return (
            <>
              {chatStatus && <div className="alibi-banner-info">{chatStatus}</div>}
              <CompanionChatPanel
                threadKind={activeCompanionThread?.conversation.kind ?? "general"}
                threadTitle={activeCompanionThread?.conversation.title ?? null}
                messages={chatMessages}
                pending={isChatPending}
                onOpenGeneral={handleOpenGeneralCompanionThread}
                onSubmit={(message) => handleCompanionMessage(message, controls)}
              />
            </>
          );
        }}
      />
    </>
  );
}
