import type {
  CompanionMessage,
  TimeBlock,
  TimeBlockCategory,
  TimeBlockCategoryRecord,
} from "@/lib/types";
import { slugifyCategoryName } from "@/lib/block-draft-utils";
import { toDateTimeLocal } from "@/lib/time-block-display";

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
