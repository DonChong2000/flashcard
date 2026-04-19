"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DatasetMeta } from "@/lib/types";

interface DatasetSelectorProps {
  datasets: DatasetMeta[];
  selected: string;
  onChange: (slug: string) => void;
}

export function DatasetSelector({ datasets, selected, onChange }: DatasetSelectorProps) {
  if (datasets.length <= 1) return null;

  return (
    <Select value={selected} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[240px]">
        <SelectValue placeholder="Select dataset" />
      </SelectTrigger>
      <SelectContent>
        {datasets.map((ds) => (
          <SelectItem key={ds.slug} value={ds.slug}>
            {ds.name} ({ds.totalQuestions} Qs)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
