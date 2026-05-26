"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarDays, MessageCircle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import type {
  TimeBlock,
  TimeBlockCategoryRecord,
} from "@/lib/types";
import {
  createCategoryMetaMap,
  formatDateHeading,
  formatDuration,
  formatTime,
  getCategoryMeta,
} from "@/lib/time-block-display";
import { cn } from "@/lib/utils";

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
          <div className="flex items-center gap-1">
            {canResume && onResume && (
              <button
                type="button"
                onClick={() => onResume(block)}
                disabled={pending}
                aria-label="resume block"
                title="resume"
                className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-teal hover:text-white disabled:translate-y-0 disabled:opacity-55"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            {onChatAbout && (
              <button
                type="button"
                onClick={() => onChatAbout(block)}
                disabled={pending}
                aria-label="chat about this block"
                title="chat"
                className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-blue hover:text-white disabled:translate-y-0 disabled:opacity-55"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(block)}
                disabled={pending}
                aria-label="edit block"
                title="edit"
                className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-lavender/20 hover:text-alibi-blue disabled:translate-y-0 disabled:opacity-55"
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
                className="flex h-9 w-9 items-center justify-center rounded-full text-alibi-teal transition hover:-translate-y-0.5 hover:bg-alibi-pink hover:text-white disabled:translate-y-0 disabled:opacity-55"
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
          <span className="text-xs font-black uppercase tracking-[0.08em] text-alibi-teal">
            {category.name}
          </span>
        </div>
        <h3 className="mt-1 wrap-break-words text-base font-black text-alibi-ink">
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
  onOpenCalendar,
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
  onChatAbout?: (block: TimeBlock) => void;
  onOpenCalendar?: () => void;
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
          {onOpenCalendar ? (
            <button
              type="button"
              onClick={onOpenCalendar}
              aria-label="open calendar"
              title="calendar"
              className="alibi-button-teal inline-flex h-11 w-11 items-center justify-center"
            >
              <CalendarDays className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href="/app/calendar"
              aria-label="open calendar"
              title="calendar"
              className="alibi-button-teal inline-flex h-11 w-11 items-center justify-center"
            >
              <CalendarDays className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-alibi-teal">
            <div className="h-5 w-5 animate-spin rounded-full border border-alibi-teal/40 border-t-alibi-teal" />
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
