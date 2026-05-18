"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  CalendarDays,
  ChevronDown,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type {
  CompanionMessage,
  TimeBlock,
  TimeBlockCategory,
  TimeBlockCategoryRecord,
} from "@/lib/types";
import { slugifyCategoryName } from "@/lib/block-draft-utils";
import {
  createCategoryMetaMap,
  formatChatTimestamp,
  formatDateHeading,
  formatDuration,
  formatTime,
  getCategoryMeta,
  toDateTimeLocal,
} from "@/lib/time-block-display";
import { cn } from "@/lib/utils";

export type EditorState = {
  block?: TimeBlock;
  isNewlyStopped: boolean;
  isManual: boolean;
  taskName: string;
  category: TimeBlockCategory | "";
  hashtags: string;
  notes: string;
  startedAt: string;
  endedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export function createEditorState(
  block: TimeBlock,
  isNewlyStopped = false,
): EditorState {
  return {
    block,
    isNewlyStopped,
    isManual: false,
    taskName: block.task_name ?? "",
    category: block.category ?? "",
    hashtags: (block.hashtags ?? []).join(" "),
    notes: block.notes ?? "",
    startedAt: toDateTimeLocal(block.started_at),
    endedAt: toDateTimeLocal(block.ended_at),
  };
}

export function createManualEditorState(): EditorState {
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - 30 * 60_000);

  return {
    isNewlyStopped: false,
    isManual: true,
    taskName: "",
    category: "",
    hashtags: "",
    notes: "",
    startedAt: toDateTimeLocal(startedAt.toISOString()),
    endedAt: toDateTimeLocal(endedAt.toISOString()),
  };
}

export function companionMessageToChatMessage(
  message: CompanionMessage,
): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.content,
    createdAt: message.created_at,
  };
}

export function resolveEditorCategory(
  value: string,
  categories: TimeBlockCategoryRecord[],
) {
  const typedCategory = value.trim();
  const matchedCategory = categories.find(
    (category) =>
      category.slug === typedCategory ||
      category.name.toLowerCase() === typedCategory.toLowerCase(),
  );
  const categorySlug =
    matchedCategory?.slug ?? slugifyCategoryName(typedCategory);

  return { matchedCategory, categorySlug };
}

export function CompanionChatPanel({
  threadKind,
  threadTitle,
  messages,
  pending,
  onOpenGeneral,
  onSubmit,
}: {
  threadKind: "general" | "time_block";
  threadTitle: string | null;
  messages: ChatMessage[];
  pending: boolean;
  onOpenGeneral: () => Promise<void>;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const latestMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages.length, pending]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = value.trim();
    if (!trimmed || pending) {
      return;
    }

    setValue("");
    void onSubmit(trimmed);
  };

  return (
    <section className="alibi-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            alibi
          </p>
          <h2 className="mt-1 text-xl font-black text-alibi-blue">
            {threadKind === "time_block"
              ? threadTitle
                ? `about ${threadTitle}`
                : "about this block"
              : "companion chat"}
          </h2>
        </div>
        <div className="flex items-center">
          {threadKind === "time_block" ? (
            <button
              type="button"
              onClick={() => void onOpenGeneral()}
              disabled={pending}
              className="alibi-button-primary inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black"
            >
              <MessageCircle className="h-4 w-4" />
              main chat
            </button>
          ) : (
            <div className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-alibi-pink/15 px-3 text-xs font-black text-alibi-pink">
              <MessageCircle className="h-4 w-4" />
              main chat
            </div>
          )}
        </div>
      </div>

      <div className="alibi-inset mt-4 flex max-h-80 min-h-44 flex-col gap-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="mt-auto text-sm font-semibold leading-6 text-alibi-teal">
            nothing here yet.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "alibi-chat-bubble",
                message.role === "user"
                  ? "ml-auto bg-alibi-blue text-white"
                  : "mr-auto bg-white text-alibi-ink shadow-[0_1px_3px_rgba(50,83,199,0.06)]",
              )}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              <time
                dateTime={message.createdAt}
                className={cn(
                  "mt-1 block font-mono text-[10px] font-black uppercase leading-4",
                  message.role === "user"
                    ? "text-white/70"
                    : "text-alibi-teal/70",
                )}
              >
                {formatChatTimestamp(message.createdAt)}
              </time>
            </div>
          ))
        )}
        {pending && (
          <div className="mr-auto inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-alibi-teal shadow-[0_1px_3px_rgba(50,83,199,0.06)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            thinking.
          </div>
        )}
        <div ref={latestMessageRef} />
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex items-end gap-2">
        <label className="sr-only" htmlFor="companion-message">
          message alibi
        </label>
        <textarea
          id="companion-message"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          disabled={pending}
          placeholder="message alibi"
          className="alibi-input min-h-11 flex-1 resize-none py-2 leading-6 placeholder:text-alibi-teal/60 disabled:opacity-55"
        />
        <button
          type="submit"
          disabled={!value.trim() || pending}
          aria-label="send message"
          title="send"
          className="alibi-button-teal inline-flex h-11 w-11 items-center justify-center"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </section>
  );
}

function CategoryPicker({
  value,
  categories,
  onChange,
}: {
  value: string;
  categories: TimeBlockCategoryRecord[];
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newValue, setNewValue] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAddingNew(false);
        setNewValue("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (addingNew) newInputRef.current?.focus();
  }, [addingNew]);

  const selected = categories.find(
    (c) => c.slug === value || c.name.toLowerCase() === value.toLowerCase(),
  );
  const displayName = selected?.name ?? (value || null);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setAddingNew(false);
          setNewValue("");
        }}
        className="alibi-input flex h-11 w-full items-center justify-between gap-2 text-left"
      >
        <span
          className={cn(
            "flex items-center gap-2 text-sm font-semibold",
            displayName ? "text-alibi-ink" : "text-alibi-teal/50",
          )}
        >
          {selected && (
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: selected.color }}
            />
          )}
          {displayName ?? "choose or add a category"}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-alibi-teal transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="alibi-card absolute z-50 mt-1 w-full overflow-hidden p-1">
          {!addingNew ? (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-semibold text-alibi-teal transition hover:bg-alibi-lavender/20"
            >
              <Plus className="h-3.5 w-3.5" />
              add new
            </button>
          ) : (
            <div className="px-1 pb-1 pt-0.5">
              <input
                ref={newInputRef}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newValue.trim()) {
                    onChange(newValue.trim());
                    setOpen(false);
                    setAddingNew(false);
                    setNewValue("");
                  } else if (e.key === "Escape") {
                    setAddingNew(false);
                    setNewValue("");
                  }
                }}
                className="alibi-input h-9 w-full text-sm"
                placeholder="new category name, press enter"
              />
            </div>
          )}

          <div className="my-1 border-t border-alibi-blue/10" />

          <div className="relative -mx-1 -mb-1">
            <div className="max-h-48 overflow-y-auto px-1 pb-6">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    onChange(cat.slug);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-semibold text-alibi-ink transition hover:bg-alibi-lavender/20",
                    value === cat.slug && "bg-alibi-blue/10 text-alibi-blue",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.name}
                </button>
              ))}
            </div>
            {categories.length > 4 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function BlockEditor({
  editor,
  categories,
  setEditor,
  onSave,
  onDelete,
  pending,
}: {
  editor: EditorState;
  categories: TimeBlockCategoryRecord[];
  setEditor: (editor: EditorState | null) => void;
  onSave: () => void;
  onDelete?: () => void;
  pending: boolean;
}) {
  return (
    <section className="alibi-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            block editor
          </p>
          <h2 className="mt-1 text-xl font-black text-alibi-blue">
            {editor.isNewlyStopped
              ? "name this block"
              : editor.isManual
                ? "add block"
                : "edit block"}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setEditor(null)}
          aria-label="close editor"
          title="close"
          className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-pink hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          task name
          <input
            value={editor.taskName}
            onChange={(event) =>
              setEditor({ ...editor, taskName: event.target.value })
            }
            className="alibi-input h-11"
            placeholder="what happened?"
          />
        </label>

        <div className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          category
          <CategoryPicker
            value={editor.category}
            categories={categories}
            onChange={(val) =>
              setEditor({
                ...editor,
                category: val as TimeBlockCategory | "",
              })
            }
          />
        </div>

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
            start
            <input
              type="datetime-local"
              value={editor.startedAt}
              onChange={(event) =>
                setEditor({ ...editor, startedAt: event.target.value })
              }
              className="alibi-input h-11 min-w-0"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
            end
            <input
              type="datetime-local"
              value={editor.endedAt}
              onChange={(event) =>
                setEditor({ ...editor, endedAt: event.target.value })
              }
              className="alibi-input h-11 min-w-0"
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          hashtags
          <input
            value={editor.hashtags}
            onChange={(event) =>
              setEditor({ ...editor, hashtags: event.target.value })
            }
            className="alibi-input h-11"
            placeholder="client, writing, reset"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-alibi-blue">
          notes · what really happened
          <textarea
            value={editor.notes}
            onChange={(event) =>
              setEditor({ ...editor, notes: event.target.value })
            }
            className="alibi-input min-h-24 resize-y py-2"
            placeholder="what you did, what got in the way, how it felt, what changed, what you noticed"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold text-alibi-pink transition hover:-translate-y-0.5 hover:bg-alibi-pink/10 disabled:translate-y-0 disabled:opacity-55"
          >
            <Trash2 className="h-4 w-4" />
            delete
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditor(null)}
            disabled={pending}
            className="h-10 rounded-2xl px-4 text-sm font-bold text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-lavender/15 disabled:translate-y-0 disabled:opacity-55"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="alibi-button-teal inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            save
          </button>
        </div>
      </div>
    </section>
  );
}

export function TimeBlockItem({
  block,
  categories,
  canResume,
  onEdit,
  onDelete,
  onResume,
  onChatAbout,
  pending,
  className,
}: {
  block: TimeBlock;
  categories: TimeBlockCategoryRecord[];
  canResume?: boolean;
  onEdit?: (block: TimeBlock) => void;
  onDelete?: (block: TimeBlock) => void;
  onResume?: (block: TimeBlock) => void;
  onChatAbout?: (block: TimeBlock) => void;
  pending?: boolean;
  className?: string;
}) {
  const category = getCategoryMeta(block.category, categories);
  const hasActions = canResume || onChatAbout || onEdit || onDelete;

  return (
    <article
      className={cn(
        "alibi-block-item flex min-w-0 flex-col gap-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-[7.5rem] font-mono text-sm font-semibold leading-6 text-alibi-teal">
          <div>{formatTime(block.started_at)}</div>
          <div>{formatTime(block.ended_at)}</div>
          <div className="mt-1 font-sans text-sm font-black text-alibi-blue">
            {formatDuration(
              block.duration_seconds,
              block.started_at,
              block.ended_at,
            )}
          </div>
        </div>

        {hasActions && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {canResume && onResume && (
            <button
              type="button"
              onClick={() => onResume(block)}
              disabled={pending}
              aria-label="resume latest block"
              title="resume"
              className="alibi-button-teal inline-flex h-9 items-center justify-center gap-1.5 px-3 text-xs font-black"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              resume
            </button>
          )}
          {onChatAbout && (
            <button
              type="button"
              onClick={() => onChatAbout(block)}
              aria-label="chat about this block"
              title="chat about this"
              className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-teal hover:text-white"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(block)}
              aria-label="edit block"
              title="edit"
              className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-blue hover:text-white"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(block)}
              disabled={pending}
              aria-label="delete block"
              title="delete"
              className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-pink transition hover:-translate-y-0.5 hover:bg-alibi-pink hover:text-white disabled:translate-y-0 disabled:opacity-55"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          <span className="text-sm font-black uppercase tracking-[0.08em] text-alibi-teal">
            {category.name}
          </span>
        </div>
        <h3 className="mt-2 wrap-break-words text-base font-black text-alibi-ink">
          {block.task_name || "unnamed time block"}
        </h3>
        {block.notes && (
          <p className="mt-1 wrap-break-words text-sm font-medium leading-6 text-alibi-teal">
            {block.notes}
          </p>
        )}
        {block.hashtags && block.hashtags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {block.hashtags.map((hashtag) => (
              <span key={hashtag} className="alibi-chip">
                #{hashtag}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function DailyBlocks({
  date,
  loading,
  blocks,
  categories,
  canResume,
  onAdd,
  onEdit,
  onDelete,
  onResume,
  onChatAbout,
  pending,
}: {
  date: Date;
  loading: boolean;
  blocks: TimeBlock[];
  categories: TimeBlockCategoryRecord[];
  canResume: boolean;
  onAdd: () => void;
  onEdit: (block: TimeBlock) => void;
  onDelete: (block: TimeBlock) => void;
  onResume: (block: TimeBlock) => void;
  onChatAbout: (block: TimeBlock) => void;
  pending: boolean;
}) {
  const categoryMap = useMemo(() => createCategoryMetaMap(categories), [
    categories,
  ]);

  return (
    <section className="alibi-card min-h-130 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal">
            today
          </p>
          <h2 className="mt-1 text-2xl font-black text-alibi-blue">
            {formatDateHeading(date)}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAdd}
            disabled={pending}
            aria-label="add completed block"
            title="add block"
            className="alibi-button-teal inline-flex h-11 w-11 items-center justify-center"
          >
            <Plus className="h-4 w-4" />
          </button>
          <Link
            href="/app/calendar"
            aria-label="open calendar"
            title="calendar"
            className="alibi-button-teal inline-flex h-11 w-11 items-center justify-center"
          >
            <CalendarDays className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-alibi-teal">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : blocks.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-alibi-lavender/40 bg-alibi-lavender/10 px-6 text-center text-sm font-semibold leading-6 text-alibi-teal">
            no completed blocks for today yet.
          </div>
        ) : (
          <ol className="grid gap-3">
            {blocks.map((block, index) => (
              <li key={block.id}>
                <TimeBlockItem
                  block={block}
                  categories={Array.from(categoryMap.values())}
                  canResume={index === blocks.length - 1 && canResume}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onResume={onResume}
                  onChatAbout={onChatAbout}
                  pending={pending}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
