"use client";

import { forwardRef, type ReactNode } from "react";
import { CheckCircle2, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moraDiff, normalizeReading, primaryReading, type MoraPart } from "@/lib/kana";
import type { VocabInfo } from "@/lib/types";

// Wrap the word in the sentence. Words can carry variants and notes ("生ける,活ける（花を～）", "～心")
// and appear conjugated (題する → 題した), so try each variant, then its stem without trailing kana,
// then the variant minus its last character (いたわる → いたわっ…).
function emphasise(sentence: string, word: string): ReactNode {
  const forms = word
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[～~]/g, "")
    .split(/[,，、・/／]/)
    .map((w) => w.trim())
    .filter(Boolean);
  const candidates = [
    ...forms,
    ...forms.map((w) => w.replace(/[぀-ゟ]+$/, "")),
    ...forms.filter((w) => w.length > 2).map((w) => w.slice(0, -1)),
  ];
  for (const w of candidates) {
    const i = w ? sentence.indexOf(w) : -1;
    if (i >= 0) {
      return (
        <>
          {sentence.slice(0, i)}
          <strong className="font-bold text-foreground underline decoration-2 underline-offset-4 decoration-sky-500/70">
            {sentence.slice(i, i + w.length)}
          </strong>
          {sentence.slice(i + w.length)}
        </>
      );
    }
  }
  return sentence;
}

function SpeakButton({ onClick, label, className }: { onClick: () => void; label: string; className?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("h-11 w-11 shrink-0 rounded-full", className)}
    >
      <Volume2 className="!size-5" />
    </Button>
  );
}

function Mora({ parts, bad }: { parts: MoraPart[]; bad: string }) {
  return (
    <span lang="ja" className="tracking-wide">
      {parts.map((p, i) => (
        <span key={i} className={p.ok ? undefined : cn("rounded px-0.5", bad)}>
          {p.text}
        </span>
      ))}
    </span>
  );
}

interface StudyCardProps {
  vocab: VocabInfo;
  revealed: boolean;
  hideFront: boolean; // listening card: the word is heard, not shown, until reveal
  canSpeak: boolean;
  typed: string | null; // submitted typed reading ("" or null = not typed)
  typedCorrect: boolean | null;
  onSpeakWord: () => void;
  onSpeakExample: () => void;
}

export const StudyCard = forwardRef<HTMLDivElement, StudyCardProps>(function StudyCard(
  { vocab, revealed, hideFront, canSpeak, typed, typedCorrect, onSpeakWord, onSpeakExample },
  ref
) {
  const showText = revealed || !hideFront;
  const diff =
    revealed && typed && typedCorrect === false ? moraDiff(normalizeReading(typed), primaryReading(vocab.reading)) : null;
  const long = vocab.word.length > 6;

  return (
    <div ref={ref} className="flex flex-col items-center text-center gap-5 py-6">
      {/* Front */}
      {showText ? (
        <div className="space-y-1">
          {revealed && vocab.reading && (
            <p lang="ja" className="text-xl text-muted-foreground" data-testid="reading">
              {vocab.reading}
            </p>
          )}
          <div className="flex items-center justify-center gap-1">
            <h2
              lang="ja"
              className={cn("font-bold leading-tight break-all", long ? "text-4xl" : "text-6xl")}
              data-testid="word"
            >
              {vocab.word}
            </h2>
            {revealed && canSpeak && <SpeakButton onClick={onSpeakWord} label="Speak word" />}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onSpeakWord}
            className="h-24 w-24 rounded-full"
            aria-label="Replay"
            data-testid="replay"
          >
            <Volume2 className="!size-10" />
          </Button>
          <p className="text-sm text-muted-foreground">Listen · tap to replay</p>
        </div>
      )}

      {/* Typed-reading result */}
      {revealed && typed && typedCorrect && (
        <p className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-sm font-medium" data-testid="typed-ok">
          <CheckCircle2 className="h-4 w-4" /> <span lang="ja">{normalizeReading(typed)}</span>
        </p>
      )}
      {diff && (
        <div className="w-full max-w-xs rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-left text-lg space-y-1" data-testid="typed-diff">
          <div className="flex items-baseline gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">You</span>
            <Mora parts={diff.typed} bad="bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200 line-through decoration-1" />
          </div>
          <div className="flex items-baseline gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">Correct</span>
            <Mora parts={diff.correct} bad="bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-100 font-semibold" />
          </div>
        </div>
      )}

      {/* Back: glosses */}
      {revealed && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <p lang="zh-Hant" className="text-2xl font-medium" data-testid="zh">{vocab.zh}</p>
            {vocab.trap && (
              <Badge
                className="border-transparent bg-amber-500 text-white hover:bg-amber-500"
                title="False friend: the kanji look Chinese but the meaning differs"
              >
                陷阱
              </Badge>
            )}
          </div>
          {vocab.en && <p className="text-sm text-muted-foreground">{vocab.en}</p>}
          {vocab.same && !vocab.trap && <p className="text-xs text-muted-foreground/80">同中文</p>}
        </div>
      )}

      {/* Example sentence: on the front when present, translation on the back */}
      {vocab.ex && showText && (
        <div className="w-full max-w-md rounded-lg bg-muted px-4 py-3 text-left">
          <div className="flex items-start gap-2">
            <p lang="ja" className="flex-1 text-lg leading-relaxed text-foreground/90" data-testid="example">
              {emphasise(vocab.ex.ja, vocab.word)}
            </p>
            {revealed && canSpeak && <SpeakButton onClick={onSpeakExample} label="Speak example" className="-mr-2 -mt-1" />}
          </div>
          {revealed && <p lang="zh-Hant" className="mt-1 text-sm text-muted-foreground">{vocab.ex.zh}</p>}
        </div>
      )}
    </div>
  );
});
