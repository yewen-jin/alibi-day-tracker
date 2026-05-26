"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { TimeBlockCategoryRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CategoryPicker({
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
