"use client";

import { CheckCircle2, XCircle, Circle, Bookmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatsOverviewProps {
  correct: number;
  incorrect: number;
  unseen: number;
  bookmarked: number;
  onCorrectClick?: () => void;
  onIncorrectClick?: () => void;
  onUnseenClick?: () => void;
  onBookmarkedClick?: () => void;
}

export function StatsOverview({
  correct,
  incorrect,
  unseen,
  bookmarked,
  onCorrectClick,
  onIncorrectClick,
  onUnseenClick,
  onBookmarkedClick,
}: StatsOverviewProps) {
  const stats = [
    {
      label: "Correct",
      value: correct,
      icon: CheckCircle2,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-50 dark:bg-secondary",
      onClick: onCorrectClick,
    },
    {
      label: "Incorrect",
      value: incorrect,
      icon: XCircle,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-secondary",
      onClick: onIncorrectClick,
    },
    {
      label: "Unseen",
      value: unseen,
      icon: Circle,
      color: "text-muted-foreground",
      bg: "bg-muted/50 dark:bg-secondary",
      onClick: onUnseenClick,
    },
    {
      label: "Bookmarked",
      value: bookmarked,
      icon: Bookmark,
      color: "text-yellow-600 dark:text-yellow-400",
      bg: "bg-yellow-50 dark:bg-secondary",
      onClick: onBookmarkedClick,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, color, bg, onClick }) => {
        const clickable = !!onClick;
        return (
          <Card
            key={label}
            className={`${bg} border-0 ${clickable ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
            onClick={onClick}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onClick?.();
                    }
                  }
                : undefined
            }
            title={clickable ? `Review ${label.toLowerCase()}` : undefined}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <Icon className={`h-6 w-6 ${color}`} />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
