"use client";

import { CheckCircle2, XCircle, Circle, Bookmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatsOverviewProps {
  correct: number;
  incorrect: number;
  unseen: number;
  bookmarked: number;
}

export function StatsOverview({ correct, incorrect, unseen, bookmarked }: StatsOverviewProps) {
  const stats = [
    {
      label: "Correct",
      value: correct,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-950",
    },
    {
      label: "Incorrect",
      value: incorrect,
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-950",
    },
    {
      label: "Unseen",
      value: unseen,
      icon: Circle,
      color: "text-muted-foreground",
      bg: "bg-muted/50",
    },
    {
      label: "Bookmarked",
      value: bookmarked,
      icon: Bookmark,
      color: "text-yellow-600",
      bg: "bg-yellow-50 dark:bg-yellow-950",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, color, bg }) => (
        <Card key={label} className={`${bg} border-0`}>
          <CardContent className="flex items-center gap-3 p-4">
            <Icon className={`h-6 w-6 ${color}`} />
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
