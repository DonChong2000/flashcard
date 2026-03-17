"use client";

import { useState, useEffect, useCallback } from "react";
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Question, QuestionProgress } from "@/lib/types";

interface QuestionCardProps {
  question: Question;
  progress?: QuestionProgress;
  onAnswer: (selected: string[], correct: boolean) => void;
  onBookmark: () => void;
  onNext: () => void;
  isLast: boolean;
}

const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];

export function QuestionCard({
  question,
  progress,
  onAnswer,
  onBookmark,
  onNext,
  isLast,
}: QuestionCardProps) {
  const isMulti = question.correct_answer.length > 1;
  const [selected, setSelected] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const isBookmarked = progress?.bookmarked ?? false;

  // Reset state when question changes
  useEffect(() => {
    setSelected([]);
    setRevealed(false);
    setDiscussionOpen(false);
  }, [question.question_number]);

  const optionKeys = Object.keys(question.options).filter((k) => OPTION_KEYS.includes(k));

  const totalVotes = Object.values(question.community_votes).reduce((a, b) => a + b, 0);

  function toggleOption(key: string) {
    if (revealed) return;
    if (isMulti) {
      setSelected((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      );
    } else {
      setSelected([key]);
    }
  }

  function checkAnswer() {
    if (selected.length === 0) return;
    const correct =
      selected.length === question.correct_answer.length &&
      selected.every((s) => question.correct_answer.includes(s));
    setRevealed(true);
    onAnswer(selected, correct);
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < optionKeys.length) {
        toggleOption(optionKeys[idx]);
        return;
      }
      if ((e.key === "Enter" || e.key === " ") && !revealed) {
        e.preventDefault();
        if (selected.length > 0) checkAnswer();
        return;
      }
      if ((e.key === "Enter" || e.key === " " || e.key === "ArrowRight") && revealed) {
        e.preventDefault();
        onNext();
        return;
      }
      if (e.key === "b" || e.key === "B") {
        onBookmark();
        return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optionKeys, selected, revealed]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function getOptionStyle(key: string) {
    if (!revealed) {
      return selected.includes(key)
        ? "border-primary bg-primary/10 ring-1 ring-primary"
        : "border-border hover:border-primary/50 hover:bg-muted/50";
    }
    const isCorrect = question.correct_answer.includes(key);
    const isSelected = selected.includes(key);
    if (isCorrect) return "border-green-500 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-100";
    if (isSelected && !isCorrect) return "border-red-500 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-100";
    return "border-border opacity-60";
  }

  const sortedDiscussion = [...(question.discussion ?? [])].sort((a, b) => b.upvotes - a.upvotes).slice(0, 3);

  const isCorrectAnswer =
    revealed &&
    selected.length === question.correct_answer.length &&
    selected.every((s) => question.correct_answer.includes(s));

  return (
    <Card className="w-full">
      <CardContent className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs">
                Q{question.question_number}
              </Badge>
              {isMulti && (
                <Badge variant="secondary" className="text-xs">
                  Multi-select ({question.correct_answer.length} answers)
                </Badge>
              )}
            </div>
            <p className="text-base leading-relaxed whitespace-pre-wrap">{question.question}</p>
          </div>
          <button
            onClick={onBookmark}
            className="text-yellow-500 hover:text-yellow-600 transition-colors flex-shrink-0 mt-1"
            title="Bookmark (B)"
          >
            {isBookmarked ? (
              <BookmarkCheck className="h-5 w-5 fill-yellow-500" />
            ) : (
              <Bookmark className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Options */}
        <div className="space-y-2">
          {optionKeys.map((key, idx) => (
            <button
              key={key}
              onClick={() => toggleOption(key)}
              disabled={revealed}
              className={cn(
                "w-full text-left rounded-lg border-2 p-3 transition-all text-sm",
                getOptionStyle(key),
                revealed ? "cursor-default" : "cursor-pointer"
              )}
            >
              <div className="flex items-start gap-3">
                <span className="font-semibold shrink-0 w-5">
                  {key}
                </span>
                <span className="flex-1">{question.options[key]}</span>
                {revealed && (
                  <div className="flex items-center gap-1 shrink-0">
                    {question.correct_answer.includes(key) ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : selected.includes(key) ? (
                      <XCircle className="h-4 w-4 text-red-600" />
                    ) : null}
                    {totalVotes > 0 && question.community_votes[key] !== undefined && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {Math.round((question.community_votes[key] / totalVotes) * 100)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Reveal feedback */}
        {revealed && (
          <div
            className={cn(
              "rounded-lg p-3 text-sm font-medium flex items-center gap-2",
              isCorrectAnswer
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
            )}
          >
            {isCorrectAnswer ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {isCorrectAnswer
              ? "Correct!"
              : `Incorrect. Correct answer: ${question.correct_answer.join(", ")}`}
          </div>
        )}

        {/* Community votes summary */}
        {revealed && totalVotes > 0 && (
          <div className="text-xs text-muted-foreground">
            Community votes ({totalVotes} total):{" "}
            {Object.entries(question.community_votes)
              .sort(([, a], [, b]) => b - a)
              .map(([k, v]) => `${k}: ${Math.round((v / totalVotes) * 100)}%`)
              .join(" · ")}
          </div>
        )}

        {/* Discussion */}
        {revealed && sortedDiscussion.length > 0 && (
          <Collapsible open={discussionOpen} onOpenChange={setDiscussionOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                {discussionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Discussion ({sortedDiscussion.length} top comments)
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 mt-3">
              {sortedDiscussion.map((d, i) => (
                <div key={i} className="border rounded-lg p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">{d.username}</span>
                    <div className="flex items-center gap-2">
                      {d.selected?.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          Answered: {d.selected.join(", ")}
                        </Badge>
                      )}
                      <span>👍 {d.upvotes}</span>
                    </div>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{d.comment}</p>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Action buttons */}
        <div className="flex justify-between items-center pt-1">
          <div className="text-xs text-muted-foreground">
            {!revealed && selected.length === 0 && `Select an answer (1–${optionKeys.length}) or click an option`}
            {!revealed && selected.length > 0 && `Selected: ${selected.join(", ")} — press Enter or click Check`}
            {revealed && "Press Enter or → to continue"}
          </div>
          <div className="flex gap-2">
            {!revealed ? (
              <Button onClick={checkAnswer} disabled={selected.length === 0} size="sm">
                Check Answer
              </Button>
            ) : (
              <Button onClick={onNext} size="sm">
                {isLast ? "Finish" : "Next →"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
