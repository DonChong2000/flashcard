"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { type Activity, dayKey, getActivity, getStreak, syncActivity } from "@/lib/activity";
import { getSyncId } from "@/lib/sync";
import { cn } from "@/lib/utils";

const WEEKS = 53;
const LEVELS = [
  "bg-muted",
  "bg-green-200 dark:bg-green-900",
  "bg-green-400 dark:bg-green-700",
  "bg-green-600 dark:bg-green-500",
  "bg-green-800 dark:bg-green-300",
];

export default function ActivityPage() {
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(() => {
    setActivity(getActivity());
    const syncId = getSyncId();
    if (syncId) syncActivity(syncId).then(() => setActivity(getActivity()), () => {});
  }, []);

  if (!activity) return null;

  // Columns are Sunday-start weeks, ending with the current week
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - (WEEKS - 1) * 7);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date, count: activity[dayKey(date)] ?? 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;
  // A month label sits over the first week that starts in that month
  const months = days.flatMap(({ date }, i) => (i % 7 === 0 && date.getDate() <= 7 ? [{ date, col: i / 7 + 1 }] : []));

  const stats = [
    { label: "Day streak", value: getStreak(activity) },
    { label: "Answers", value: total.toLocaleString() },
    { label: "Active days", value: activeDays },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-4xl py-8 space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link
              href="/"
              aria-label="Back to home"
              className="h-10 w-10 flex items-center justify-center rounded-md hover:bg-accent"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Activity</h1>
          </div>
          <ThemeToggle />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {stats.map(({ label, value }, i) => (
            <Card key={label} className={i === 0 ? "border-0 bg-green-50 dark:bg-secondary" : undefined}>
              <CardContent className="p-4">
                <p className={cn("text-2xl font-bold", i === 0 && "text-green-700 dark:text-green-400")}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold">Last 12 months</h2>
            {/* rtl makes the phone-width scroll start at the newest week */}
            <div dir="rtl" className="overflow-x-auto">
              <div dir="ltr" className="min-w-[560px] space-y-1">
                <div
                  className="grid gap-[2px] text-[11px] text-muted-foreground"
                  style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}
                >
                  {months.map(({ date, col }) => (
                    <span key={col} className="whitespace-nowrap" style={{ gridColumnStart: col }}>
                      {date.toLocaleString("en", { month: "short" })}
                    </span>
                  ))}
                </div>
                <div
                  className="grid grid-flow-col grid-rows-7 gap-[2px]"
                  style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}
                >
                  {days.map(({ date, count }) => (
                    <div
                      key={dayKey(date)}
                      title={`${date.toLocaleDateString()}: ${count} answer${count === 1 ? "" : "s"}`}
                      className={cn(
                        "aspect-square rounded-[2px]",
                        date > now ? "invisible" : LEVELS[Math.ceil((4 * count) / max)]
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-[3px] text-[11px] text-muted-foreground">
              <span className="mr-1">Less</span>
              {LEVELS.map((c) => (
                <div key={c} className={cn("h-2.5 w-2.5 rounded-[2px]", c)} />
              ))}
              <span className="ml-1">More</span>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Every answer in every question bank counts. Your devices share this history through your Sync ID.
        </p>
      </div>
    </main>
  );
}
