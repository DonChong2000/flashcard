"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, RefreshCw, Play, Bookmark, XCircle, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DatasetSelector } from "@/components/DatasetSelector";
import { StatsOverview } from "@/components/StatsOverview";
import { fetchManifest, fetchTopicQuestions } from "@/lib/manifest";
import {
  getProgress,
  getBookmarkedIds,
  getIncorrectIds,
  resetProgress,
} from "@/lib/progress";
import type { DatasetMeta, ProgressStore, Question } from "@/lib/types";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/flashcard";

interface TopicStats {
  topic: number;
  total: number;
  correct: number;
  incorrect: number;
  unseen: number;
}

export default function HomePage() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [progress, setProgress] = useState<ProgressStore>({});
  const [topicStats, setTopicStats] = useState<TopicStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchManifest(BASE_PATH)
      .then((m) => {
        setDatasets(m.datasets);
        if (m.datasets.length > 0) setSelectedSlug(m.datasets[0].slug);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSlug) return;
    setProgress(getProgress(selectedSlug));
  }, [selectedSlug]);

  const dataset = datasets.find((d) => d.slug === selectedSlug);

  // Load topic question counts
  useEffect(() => {
    if (!dataset) return;
    const load = async () => {
      const prog = getProgress(selectedSlug);
      const stats = await Promise.all(
        dataset.topics.map(async (topic) => {
          try {
            const questions = await fetchTopicQuestions(BASE_PATH, selectedSlug, topic);
            let correct = 0, incorrect = 0, unseen = 0;
            for (const q of questions) {
              const s = prog[q.question_number]?.status ?? "unseen";
              if (s === "correct") correct++;
              else if (s === "incorrect") incorrect++;
              else unseen++;
            }
            return { topic, total: questions.length, correct, incorrect, unseen };
          } catch {
            return { topic, total: 0, correct: 0, incorrect: 0, unseen: 0 };
          }
        })
      );
      setTopicStats(stats);
    };
    load();
  }, [dataset, selectedSlug]);

  const bookmarked = getBookmarkedIds(selectedSlug).length;
  const incorrect = getIncorrectIds(selectedSlug).length;

  const totalCorrect = Object.values(progress).filter((p) => p.status === "correct").length;
  const totalIncorrect = Object.values(progress).filter((p) => p.status === "incorrect").length;
  const totalUnseen = (dataset?.totalQuestions ?? 0) - totalCorrect - totalIncorrect;

  function go(topic: number | "all", filter: string) {
    router.push(
      `/quiz?dataset=${selectedSlug}&topic=${topic}&filter=${filter}`
    );
  }

  function handleReset() {
    if (confirm("Reset all progress for this dataset?")) {
      resetProgress(selectedSlug);
      setProgress({});
      setTopicStats((prev) => prev.map((t) => ({ ...t, correct: 0, incorrect: 0, unseen: t.total })));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Failed to load data</p>
          <p className="text-muted-foreground text-sm">{error}</p>
          <p className="text-muted-foreground text-xs">Run <code>npm run dev</code> to process data files.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-4xl py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">AWS Cert Flashcards</h1>
              {dataset && (
                <p className="text-sm text-muted-foreground">{dataset.totalQuestions} questions</p>
              )}
            </div>
          </div>
          <DatasetSelector
            datasets={datasets}
            selected={selectedSlug}
            onChange={setSelectedSlug}
          />
        </div>

        {/* Stats */}
        {dataset && (
          <StatsOverview
            correct={totalCorrect}
            incorrect={totalIncorrect}
            unseen={totalUnseen}
            bookmarked={bookmarked}
          />
        )}

        {/* Quick actions */}
        {dataset && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => go("all", "all")} className="gap-2">
              <Play className="h-4 w-4" />
              Start All
            </Button>
            <Button
              variant="outline"
              onClick={() => go("all", "incorrect")}
              disabled={incorrect === 0}
              className="gap-2"
            >
              <XCircle className="h-4 w-4" />
              Review Incorrect ({incorrect})
            </Button>
            <Button
              variant="outline"
              onClick={() => go("all", "bookmarked")}
              disabled={bookmarked === 0}
              className="gap-2"
            >
              <Bookmark className="h-4 w-4" />
              Review Bookmarked ({bookmarked})
            </Button>
            <Button
              variant="outline"
              onClick={() => go("all", "bookmarked+incorrect")}
              disabled={bookmarked === 0 && incorrect === 0}
              className="gap-2"
            >
              <BookmarkCheck className="h-4 w-4" />
              Bookmarked + Incorrect
            </Button>
            <Button variant="ghost" onClick={handleReset} className="gap-2 text-destructive hover:text-destructive">
              <RefreshCw className="h-4 w-4" />
              Reset Progress
            </Button>
          </div>
        )}

        {/* Topic grid */}
        {topicStats.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Topics</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topicStats.map((ts) => {
                const pct = ts.total > 0 ? Math.round((ts.correct / ts.total) * 100) : 0;
                return (
                  <Card
                    key={ts.topic}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => go(ts.topic, "all")}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">Topic {ts.topic}</Badge>
                        <span className="text-xs text-muted-foreground">{ts.total} Qs</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span className="text-green-600">{ts.correct} correct</span>
                        {ts.incorrect > 0 && <span className="text-red-600">{ts.incorrect} incorrect</span>}
                        <span>{pct}%</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {datasets.length === 0 && !loading && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No datasets found. Place JSON files in the <code>data/</code> directory and restart.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
