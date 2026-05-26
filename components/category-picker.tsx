"use client";

import { Dropdown } from "@/components/dropdown";
import type { TimeBlockCategoryRecord } from "@/lib/types";

export function CategoryPicker({
  value,
  categories,
  onChange,
}: {
  value: string;
  categories: TimeBlockCategoryRecord[];
  onChange: (val: string) => void;
}) {
  return (
    <Dropdown
      value={value}
      options={categories.map((c) => ({
        value: c.slug,
        label: c.name,
        color: c.color,
      }))}
      onChange={onChange}
      placeholder="choose or add a category"
      addable={{
        onAdd: onChange,
        addLabel: "add new",
        inputPlaceholder: "new category name, press enter",
      }}
    />
  );
}
