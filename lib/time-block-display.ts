import type {
  ActiveTimer,
  TimeBlockCategory,
  TimeBlockCategoryRecord,
} from "@/lib/types";

export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  deep_work: "#3253C7",
  admin: "#6B7DD6",
  social: "#BF7DAD",
  errands: "#43849D",
  care: "#2F8F72",
  creative: "#7A5CC7",
  rest: "#C88A2D",
};

export const CATEGORY_COLOR_PALETTE = [
  "#3253C7",
  "#6B7DD6",
  "#BF7DAD",
  "#43849D",
  "#2F8F72",
  "#7A5CC7",
  "#C88A2D",
  "#C8553D",
  "#2E7D9A",
  "#8A6A2F",
  "#A3477E",
  "#596A3D",
];

export const FALLBACK_CATEGORIES = [
  {
    id: "deep_work",
    user_id: null,
    slug: "deep_work",
    name: "deep work",
    color: DEFAULT_CATEGORY_COLORS.deep_work,
    is_default: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "admin",
    user_id: null,
    slug: "admin",
    name: "admin",
    color: DEFAULT_CATEGORY_COLORS.admin,
    is_default: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "social",
    user_id: null,
    slug: "social",
    name: "social",
    color: DEFAULT_CATEGORY_COLORS.social,
    is_default: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "errands",
    user_id: null,
    slug: "errands",
    name: "errands",
    color: DEFAULT_CATEGORY_COLORS.errands,
    is_default: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "care",
    user_id: null,
    slug: "care",
    name: "care",
    color: DEFAULT_CATEGORY_COLORS.care,
    is_default: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "creative",
    user_id: null,
    slug: "creative",
    name: "creative",
    color: DEFAULT_CATEGORY_COLORS.creative,
    is_default: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "rest",
    user_id: null,
    slug: "rest",
    name: "rest",
    color: DEFAULT_CATEGORY_COLORS.rest,
    is_default: true,
    created_at: "",
    updated_at: "",
  },
] satisfies TimeBlockCategoryRecord[];

function hashString(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function defaultCategoryColor(name: string) {
  const key = name.trim().toLowerCase().replace(/\s+/g, "_");
  return (
    DEFAULT_CATEGORY_COLORS[key] ??
    CATEGORY_COLOR_PALETTE[
      hashString(key || name) % CATEGORY_COLOR_PALETTE.length
    ]
  );
}

function normalizeCategoryColor(category: TimeBlockCategoryRecord) {
  const canonicalColor =
    DEFAULT_CATEGORY_COLORS[category.slug] ?? category.color;
  return canonicalColor === category.color
    ? category
    : { ...category, color: canonicalColor };
}

function distinctColorForCategory(
  category: TimeBlockCategoryRecord,
  usedColors: Set<string>,
) {
  const normalized = normalizeCategoryColor(category);

  if (!usedColors.has(normalized.color)) {
    usedColors.add(normalized.color);
    return normalized;
  }

  const start = hashString(normalized.slug || normalized.name);
  for (let i = 0; i < CATEGORY_COLOR_PALETTE.length; i += 1) {
    const color =
      CATEGORY_COLOR_PALETTE[(start + i) % CATEGORY_COLOR_PALETTE.length];
    if (!usedColors.has(color)) {
      usedColors.add(color);
      return { ...normalized, color };
    }
  }

  return normalized;
}

export function withDistinctCategoryColors(
  categories: TimeBlockCategoryRecord[],
) {
  const usedColors = new Set<string>();
  return categories.map((category) =>
    distinctColorForCategory(category, usedColors),
  );
}

export function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}

export function getElapsedSeconds(
  activeTimer: ActiveTimer | null,
  now: number,
) {
  if (!activeTimer) {
    return 0;
  }

  const startedAt = new Date(activeTimer.started_at).getTime();

  if (Number.isNaN(startedAt)) {
    return 0;
  }

  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function formatDuration(
  seconds: number | null,
  start: string,
  end: string | null,
) {
  let totalSeconds = seconds;

  if (totalSeconds === null && end) {
    totalSeconds = Math.max(
      0,
      Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000),
    );
  }

  if (!totalSeconds) {
    return "0m";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${Math.max(1, minutes)}m`;
}

export function formatTime(value: string | null) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatChatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDateHeading(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function toDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 19);
}

export function fromDateTimeLocal(value: string) {
  return new Date(value).toISOString();
}

export function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start,
    end,
    input: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  };
}

export function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return {
    start,
    end,
    input: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  };
}

export function parseHashtags(value: string) {
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function createCategoryMetaMap(categories: TimeBlockCategoryRecord[]) {
  return new Map(
    withDistinctCategoryColors(categories).map((category) => [
      category.slug,
      category,
    ]),
  );
}

export function getCategoryMeta(
  category: TimeBlockCategory | null,
  categoriesBySlug:
    | Map<TimeBlockCategoryRecord["slug"], TimeBlockCategoryRecord>
    | TimeBlockCategoryRecord[],
) {
  const matched = Array.isArray(categoriesBySlug)
    ? categoriesBySlug.find((item) => item.slug === category)
    : categoriesBySlug.get(category ?? "");

  const fallback = {
    id: "uncategorized",
    user_id: null,
    slug: category ?? "uncategorized",
    name: category ? category.replace(/_/g, " ") : "uncategorized",
    color: "#93A5E4",
    is_default: false,
    created_at: "",
    updated_at: "",
  };

  return normalizeCategoryColor(matched ?? fallback);
}
