"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface ProgressHeaderProps {
  current: number;
  total: number;
  filter?: string;
  label?: string;
}

export function ProgressHeader({
  current,
  total,
  filter,
  label,
}: ProgressHeaderProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {label && (
            <Badge variant="secondary">{label}</Badge>
          )}
          {filter && filter !== "all" && (
            <Badge variant="outline" className="capitalize">
              {filter.replace("+", " + ")}
            </Badge>
          )}
        </div>
        <span className="text-muted-foreground font-mono">
          {current} / {total}
        </span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
