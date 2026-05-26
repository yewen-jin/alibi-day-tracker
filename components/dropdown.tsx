"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type DropdownOption = {
  value: string;
  label: string;
  color?: string;
};

export type AddableConfig = {
  onAdd: (name: string) => void;
  addLabel?: string;
  inputPlaceholder?: string;
};

export function Dropdown({
  value,
  options,
  onChange,
  placeholder = "select",
  addable,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (val: string) => void;
  placeholder?: string;
  addable?: AddableConfig;
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

  const selected = options.find(
    (o) =>
      o.value === value ||
      (value !== "" && o.label.toLowerCase() === value.toLowerCase()),
  );
  const displayLabel = selected?.label ?? (value || null);
  const showPlaceholder = !displayLabel;

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
            showPlaceholder ? "text-alibi-teal/50" : "text-alibi-ink",
          )}
        >
          {selected?.color && (
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: selected.color }}
            />
          )}
          {displayLabel ?? placeholder}
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
          {addable && !addingNew && (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-semibold text-alibi-teal transition hover:bg-alibi-lavender/20"
            >
              <Plus className="h-3.5 w-3.5" />
              {addable.addLabel ?? "add new"}
            </button>
          )}
          {addable && addingNew && (
            <div className="px-1 pb-1 pt-0.5">
              <input
                ref={newInputRef}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newValue.trim()) {
                    addable.onAdd(newValue.trim());
                    setOpen(false);
                    setAddingNew(false);
                    setNewValue("");
                  } else if (e.key === "Escape") {
                    setAddingNew(false);
                    setNewValue("");
                  }
                }}
                className="alibi-input h-9 w-full text-sm"
                placeholder={addable.inputPlaceholder ?? "type and press enter"}
              />
            </div>
          )}

          {addable && <div className="my-1 border-t border-alibi-blue/10" />}

          <div className="relative -mx-1 -mb-1">
            <div className="max-h-48 overflow-y-auto px-1 pb-6">
              {options.map((opt) => (
                <button
                  key={opt.value || "__empty__"}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-semibold transition hover:bg-alibi-lavender/20",
                    value === opt.value
                      ? "bg-alibi-blue/10 text-alibi-blue"
                      : opt.value === ""
                        ? "text-alibi-teal/70"
                        : "text-alibi-ink",
                  )}
                >
                  {opt.color && (
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
            {options.length > 4 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
