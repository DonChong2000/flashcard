"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, RefreshCw, Play, Bookmark, XCircle, BookmarkCheck, Download, Upload } from "lucide-react";
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
  exportProgress,
  importProgress,
  type ProgressExport,
} from "@/lib/progress";
import type { DatasetMeta, ProgressStore } from "@/lib/types";

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
  const [pendingImport, setPendingImport] = useState<{ data: ProgressExport; slug: string; totalQuestions: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleExport() {
    if (!dataset) return;
    const data = exportProgress(selectedSlug, dataset.totalQuestions);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${selectedSlug}-progress-${dateStr}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !dataset) return;
    // Reset so the same file can be re-selected
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        // Validate shape
        if (raw.version !== 1) {
          alert(`Unknown export version "${raw.version}". Cannot import.`);
          return;
        }
        if (!("question_set" in raw && "date" in raw && "correct" in raw && "incorrect" in raw && "bookmarked" in raw)) {
          alert("Invalid progress file: missing required fields.");
          return;
        }
        const hexRe = /^[0-9a-fA-F]*$/;
        if (!hexRe.test(raw.correct) || !hexRe.test(raw.incorrect) || !hexRe.test(raw.bookmarked)) {
          alert("Invalid progress file: hex strings contain invalid characters.");
          return;
        }
        if (raw.question_set !== selectedSlug) {
          if (!confirm(`This file is for "${raw.question_set}" but current dataset is "${selectedSlug}". Import anyway?`)) return;
        }
        setPendingImport({ data: raw as ProgressExport, slug: selectedSlug, totalQuestions: dataset.totalQuestions });
      } catch {
        alert("Failed to parse file. Make sure it is a valid JSON progress export.");
      }
    };
    reader.readAsText(file);
  }

  function handleImportConfirm(mode: "replace" | "merge") {
    if (!pendingImport) return;
    importProgress(pendingImport.slug, pendingImport.data, pendingImport.totalQuestions, mode === "merge");
    setPendingImport(null);
    window.location.reload();
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
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" onClick={handleImportClick} className="gap-2">
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* Import confirmation dialog */}
        {pendingImport && (
          <Card className="border-amber-400">
            <CardContent className="p-4 space-y-3">
              <p className="font-medium text-sm">Import progress from <span className="font-mono">{pendingImport.data.question_set}</span> ({new Date(pendingImport.data.date).toLocaleString()})?</p>
              <p className="text-xs text-muted-foreground">
                <strong>Replace</strong> — overwrite all current progress.{" "}
                <strong>Merge</strong> — only fill in questions you haven&apos;t answered yet.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleImportConfirm("replace")}>Replace</Button>
                <Button size="sm" variant="outline" onClick={() => handleImportConfirm("merge")}>Merge</Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
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
