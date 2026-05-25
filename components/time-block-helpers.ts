import type {
  CompanionMessage,
  EffortLevel,
  Mood,
  Satisfaction,
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
  mood: Mood | "";
  effortLevel: EffortLevel | "";
  satisfaction: Satisfaction | "";
  avoidanceMarker: boolean;
  hyperfocusMarker: boolean;
  guiltMarker: boolean;
  noveltyMarker: boolean;
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
  const startedAt = toDateTimeLocal(block.started_at);
  let endedAt = toDateTimeLocal(block.ended_at);
  if (isNewlyStopped && startedAt && startedAt === endedAt) {
    endedAt = toDateTimeLocal(
      new Date(new Date(block.ended_at ?? block.started_at).getTime() + 1000).toISOString(),
    );
  }

  return {
    block,
    isNewlyStopped,
    isManual: false,
    taskName: block.task_name ?? "",
    category: block.category ?? "",
    hashtags: (block.hashtags ?? []).join(" "),
    notes: block.notes ?? "",
    startedAt,
    endedAt,
    mood: block.mood ?? "",
    effortLevel: block.effort_level ?? "",
    satisfaction: block.satisfaction ?? "",
    avoidanceMarker: block.avoidance_marker,
    hyperfocusMarker: block.hyperfocus_marker,
    guiltMarker: block.guilt_marker,
    noveltyMarker: block.novelty_marker,
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
    mood: "",
    effortLevel: "",
    satisfaction: "",
    avoidanceMarker: false,
    hyperfocusMarker: false,
    guiltMarker: false,
    noveltyMarker: false,
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
