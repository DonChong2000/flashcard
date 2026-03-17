"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface ProgressHeaderProps {
  current: number;
  total: number;
  topic?: number | "all";
  datasetName?: string;
  filter?: string;
}

export function ProgressHeader({
  current,
  total,
  topic,
  datasetName,
  filter,
}: ProgressHeaderProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {datasetName && (
            <span className="text-muted-foreground font-medium">{datasetName}</span>
          )}
          {topic !== undefined && (
            <Badge variant="secondary">
              {topic === "all" ? "All Topics" : `Topic ${topic}`}
            </Badge>
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
