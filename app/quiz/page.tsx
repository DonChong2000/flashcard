"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuestionCard } from "@/components/QuestionCard";
import { ProgressHeader } from "@/components/ProgressHeader";
import { fetchTopicQuestions } from "@/lib/manifest";
import {
  getProgress,
  setQuestionProgress,
  toggleBookmark,
  getBookmarkedIds,
  getIncorrectIds,
} from "@/lib/progress";
import type { Question, QuestionProgress, QuizFilter } from "@/lib/types";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/flashcard";

function QuizContent() {
  const router = useRouter();
  const params = useSearchParams();

  const slug = params.get("dataset") ?? "";
  const topicParam = params.get("topic") ?? "all";
  const VALID_FILTERS: QuizFilter[] = ["all", "incorrect", "bookmarked", "bookmarked+incorrect"];
  const filterRaw = params.get("filter") ?? "all";
  const filter: QuizFilter = VALID_FILTERS.includes(filterRaw as QuizFilter) ? (filterRaw as QuizFilter) : "all";
  const topic: number | "all" = topicParam === "all" ? "all" : parseInt(topicParam);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<number, QuestionProgress>>({});
  const [sessionResults, setSessionResults] = useState<{ correct: number; total: number } | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const prog = getProgress(slug);
        setProgress(prog);

        // Fetch questions
        const qs: Question[] = await fetchTopicQuestions(BASE_PATH, slug, topic);

        // Apply filter
        if (filter === "incorrect") {
          const ids = new Set(getIncorrectIds(slug));
          qs = qs.filter((q) => ids.has(q.question_number));
        } else if (filter === "bookmarked") {
          const ids = new Set(getBookmarkedIds(slug));
          qs = qs.filter((q) => ids.has(q.question_number));
        } else if (filter === "bookmarked+incorrect") {
          const bIds = new Set(getBookmarkedIds(slug));
          const iIds = new Set(getIncorrectIds(slug));
          qs = qs.filter((q) => bIds.has(q.question_number) || iIds.has(q.question_number));
        }

        setQuestions(qs);
        setCurrent(0);
        setSessionResults(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [slug, topicParam, filter]);

  function handleAnswer(selected: string[], correct: boolean) {
    if (!questions[current]) return;
    const q = questions[current];
    const prog = getProgress(slug);
    setQuestionProgress(slug, q.question_number, {
      status: correct ? "correct" : "incorrect",
      selectedAnswer: selected,
      attempts: (prog[q.question_number]?.attempts ?? 0) + 1,
      lastAttempted: new Date().toISOString(),
    });
    setProgress(getProgress(slug));
  }

  function handleBookmark() {
    if (!questions[current]) return;
    const q = questions[current];
    toggleBookmark(slug, q.question_number);
    setProgress(getProgress(slug));
  }

  function handleNext() {
    if (current + 1 >= questions.length) {
      // Session complete
      const prog = getProgress(slug);
      let correct = 0;
      for (const q of questions) {
        if (prog[q.question_number]?.status === "correct") correct++;
      }
      setSessionResults({ correct, total: questions.length });
    } else {
      setCurrent((c) => c + 1);
    }
  }

  const currentQuestion = questions[current];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading questions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-destructive font-medium">Error: {error}</p>
          <Button variant="outline" onClick={() => router.push("/")}>
            ← Back
          </Button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">No questions match this filter.</p>
          <Button variant="outline" onClick={() => router.push("/")}>
            ← Back
          </Button>
        </div>
      </div>
    );
  }

  if (sessionResults) {
    const pct = Math.round((sessionResults.correct / sessionResults.total) * 100);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-6">
            <Trophy className="h-16 w-16 text-yellow-500 mx-auto" />
            <div>
              <h2 className="text-2xl font-bold">Session Complete!</h2>
              <p className="text-muted-foreground mt-1">
                {topic === "all" ? "All Topics" : `Topic ${topic}`}
                {filter !== "all" && ` · ${filter}`}
              </p>
            </div>
            <div className="text-5xl font-bold text-primary">
              {sessionResults.correct}/{sessionResults.total}
            </div>
            <p className="text-lg text-muted-foreground">{pct}% correct</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button
                onClick={() => {
                  setCurrent(0);
                  setSessionResults(null);
                }}
              >
                Restart Session
              </Button>
              <Button variant="outline" onClick={() => router.push("/")}>
                ← Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-3xl py-6 space-y-5 px-0 sm:px-4">
        {/* Navigation */}
        <div className="flex items-center gap-3 px-4 sm:px-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Button>
        </div>

        {/* Progress */}
        <div className="px-4 sm:px-0">
        <ProgressHeader
          current={current + 1}
          total={questions.length}
          topic={topic}
          filter={filter}
        />
        </div>

        {/* Question */}
        {currentQuestion && (
          <QuestionCard
            question={currentQuestion}
            progress={progress[currentQuestion.question_number]}
            onAnswer={handleAnswer}
            onBookmark={handleBookmark}
            onNext={handleNext}
            isLast={current + 1 >= questions.length}
          />
        )}
      </div>
    </main>
  );
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <QuizContent />
    </Suspense>
  );
}
