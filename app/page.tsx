"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, RefreshCw, Play, Bookmark, XCircle, BookmarkCheck, Download, Upload, Shuffle, SlidersHorizontal, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DatasetSelector } from "@/components/DatasetSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatsOverview } from "@/components/StatsOverview";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { fetchManifest } from "@/lib/manifest";
import {
  getProgress,
  resetProgress,
  exportProgress,
  importProgress,
  type ProgressExport,
} from "@/lib/progress";
import { getSelectedDataset, setSelectedDataset } from "@/lib/preferences";
import type { DatasetMeta, ProgressStore, QuizFilter } from "@/lib/types";
import { BASE_PATH } from "@/lib/constants";
const RANDOM_EXAM_SIZE = 65;

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ data: ProgressExport; slug: string; totalQuestions: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom quiz builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderTags, setBuilderTags] = useState<string[]>([]);
  const [builderFrom, setBuilderFrom] = useState("");
  const [builderTo, setBuilderTo] = useState("");
  const [builderRandom, setBuilderRandom] = useState("");
  const [builderFilter, setBuilderFilter] = useState<QuizFilter>("all");

  useEffect(() => {
    fetchManifest(BASE_PATH)
      .then((m) => {
        setDatasets(m.datasets);
        if (m.datasets.length === 0) return;
        const saved = getSelectedDataset();
        const restored = saved && m.datasets.some((d) => d.slug === saved) ? saved : m.datasets[0].slug;
        setSelectedSlug(restored);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSlug) return;
    setSelectedDataset(selectedSlug);
    setProgress(getProgress(selectedSlug));
  }, [selectedSlug]);

  const dataset = useMemo(() => datasets.find((d) => d.slug === selectedSlug), [datasets, selectedSlug]);

  const { totalCorrect, totalIncorrect, totalUnseen, bookmarked, incorrect } = useMemo(() => {
    let correct = 0, incorrect = 0, bookmarked = 0;
    for (const p of Object.values(progress)) {
      if (p.status === "correct") correct++;
      else if (p.status === "incorrect") incorrect++;
      if (p.bookmarked) bookmarked++;
    }
    return {
      totalCorrect: correct,
      totalIncorrect: incorrect,
      totalUnseen: (dataset?.totalQuestions ?? 0) - correct - incorrect,
      bookmarked,
      incorrect,
    };
  }, [progress, dataset?.totalQuestions]);

  const topicStats = useMemo(() => {
    if (!dataset) return [];
    return dataset.topics.map((topic) => {
      const qNums = dataset.topicQuestions[topic] ?? [];
      let correct = 0, incorrect = 0;
      for (const qNum of qNums) {
        const s = progress[qNum]?.status;
        if (s === "correct") correct++;
        else if (s === "incorrect") incorrect++;
      }
      return { topic, total: qNums.length, correct, incorrect, unseen: qNums.length - correct - incorrect };
    });
  }, [dataset, progress]);

  const tagStats = useMemo(() => {
    if (!dataset?.tagQuestions) return [];
    return Object.entries(dataset.tagQuestions).map(([tag, qNums]) => {
      let correct = 0, incorrect = 0;
      for (const qNum of qNums) {
        const s = progress[qNum]?.status;
        if (s === "correct") correct++;
        else if (s === "incorrect") incorrect++;
      }
      return { tag, total: qNums.length, correct, incorrect };
    });
  }, [dataset, progress]);

  // Count of questions in the current tag-filtered subset (for range presets)
  const builderSubsetSize = useMemo(() => {
    if (!dataset) return 0;
    if (builderTags.length === 0) return dataset.totalQuestions;
    const nums = new Set<number>();
    for (const tag of builderTags) {
      for (const n of dataset.tagQuestions?.[tag] ?? []) nums.add(n);
    }
    return nums.size;
  }, [builderTags, dataset]);

  function buildCustomUrl() {
    const params = new URLSearchParams({ dataset: selectedSlug, topic: "all", filter: builderFilter });
    if (builderTags.length > 0) params.set("tags", builderTags.join(","));
    if (builderFrom.trim()) params.set("from", builderFrom.trim());
    if (builderTo.trim()) params.set("to", builderTo.trim());
    if (builderRandom.trim()) params.set("random", builderRandom.trim());
    return `/quiz?${params.toString()}`;
  }

  function go(topic: number | "all", filter: QuizFilter) {
    router.push(
      `/quiz?dataset=${selectedSlug}&topic=${topic}&filter=${filter}`
    );
  }

  function handleReset() {
    if (confirm("Reset all progress for this dataset?")) {
      resetProgress(selectedSlug);
      setProgress({});
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
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <BookOpen className="h-7 w-7 shrink-0 text-secondary-foreground" />
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold">AWS Cert Flashcards</h1>
                {dataset && (
                  <p className="text-sm text-muted-foreground">{dataset.totalQuestions} questions</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:block">
                <DatasetSelector
                  datasets={datasets}
                  selected={selectedSlug}
                  onChange={setSelectedSlug}
                />
              </div>
              <ThemeToggle />
            </div>
          </div>
          <div className="sm:hidden">
            <DatasetSelector
              datasets={datasets}
              selected={selectedSlug}
              onChange={setSelectedSlug}
            />
          </div>
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
            <Button onClick={() => go("all", "all")} className="gap-2 bg-secondary-foreground text-secondary hover:bg-secondary-foreground/90">
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

        {/* Custom Quiz Builder */}
        {dataset && (
          <Collapsible open={builderOpen} onOpenChange={setBuilderOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full gap-2 justify-between">
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Custom Quiz Builder
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${builderOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-2">
                <CardContent className="p-4 space-y-4">
                  {/* Filter */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filter</label>
                    <div className="flex flex-wrap gap-2">
                      {(["all", "incorrect", "bookmarked", "bookmarked+incorrect"] as QuizFilter[]).map((f) => (
                        <Button
                          key={f}
                          size="sm"
                          variant={builderFilter === f ? "default" : "outline"}
                          onClick={() => setBuilderFilter(f)}
                          className="capitalize text-xs h-7"
                        >
                          {f.replace("+", " + ")}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  {tagStats.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</label>
                      <div className="flex flex-wrap gap-2">
                        {tagStats.map(({ tag }) => {
                          const selected = builderTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              onClick={() => {
                                setBuilderTags((prev) =>
                                  selected ? prev.filter((t) => t !== tag) : [...prev, tag]
                                );
                                setBuilderFrom("");
                                setBuilderTo("");
                              }}
                              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                selected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-input hover:bg-accent"
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Question range */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Question Range</label>
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: Math.ceil(builderSubsetSize / 100) }, (_, i) => {
                        const from = i * 100 + 1;
                        const to = Math.min((i + 1) * 100, builderSubsetSize);
                        const active = builderFrom === String(from) && builderTo === String(to);
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              if (active) { setBuilderFrom(""); setBuilderTo(""); }
                              else { setBuilderFrom(String(from)); setBuilderTo(String(to)); }
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-input hover:bg-accent"
                            }`}
                          >
                            {from}–{to}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        min={1}
                        max={dataset.totalQuestions}
                        placeholder="From"
                        value={builderFrom}
                        onChange={(e) => setBuilderFrom(e.target.value)}
                        className="w-24 h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <span className="text-muted-foreground text-sm">–</span>
                      <input
                        type="number"
                        min={1}
                        max={dataset.totalQuestions}
                        placeholder="To"
                        value={builderTo}
                        onChange={(e) => setBuilderTo(e.target.value)}
                        className="w-24 h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </div>

                  {/* Random count */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Random Sample</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        placeholder="e.g. 65 (leave blank for all)"
                        value={builderRandom}
                        onChange={(e) => setBuilderRandom(e.target.value)}
                        className="w-56 h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </div>

                  {/* Start */}
                  <div>
                    <Button onClick={() => router.push(buildCustomUrl())} className="gap-2">
                      <Play className="h-4 w-4" />
                      Start Custom Quiz
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Practice Set grid */}
        {topicStats.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Practice Sets</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Random exam card */}
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow border-dashed"
                onClick={() => router.push(`/quiz?dataset=${selectedSlug}&topic=all&filter=all&random=${RANDOM_EXAM_SIZE}`)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="gap-1">
                      <Shuffle className="h-3 w-3" />
                      Random {RANDOM_EXAM_SIZE}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{RANDOM_EXAM_SIZE} Qs</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Randomly sampled exam set</p>
                </CardContent>
              </Card>
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
                        <Badge variant="outline">Practice Set {ts.topic}</Badge>
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

        {/* Practice by Tag */}
        {tagStats.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Practice by Tag</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tagStats.map((ts) => {
                const pct = ts.total > 0 ? Math.round((ts.correct / ts.total) * 100) : 0;
                return (
                  <Card
                    key={ts.tag}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => router.push(`/quiz?dataset=${selectedSlug}&topic=all&filter=all&tags=${ts.tag}`)}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="capitalize">{ts.tag}</Badge>
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
