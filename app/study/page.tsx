"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, PartyPopper, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StudyCard } from "@/components/StudyCard";
import { fetchManifest, fetchTopicQuestions } from "@/lib/manifest";
import { getProgress, setQuestionProgress } from "@/lib/progress";
import { logActivity } from "@/lib/activity";
import {
  buildQueue,
  getSrs,
  getSrsSettings,
  newStudiedToday,
  nextDueAt,
  setSrsCard,
  setSrsSettings,
  type SrsCard,
  type SrsSettings,
  type SrsStore,
} from "@/lib/srs";
import { formatInterval, getScheduler, GRADES, previewGrades, type Grade, type Scheduler } from "@/lib/fsrs";
import { liveKana, readingMatches } from "@/lib/kana";
import { getJapaneseVoice, onVoicesChanged, speak } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { BASE_PATH } from "@/lib/constants";
import type { Question } from "@/lib/types";

// A card graded into a short learning step comes back in this session if it is due within this window.
const SAME_SESSION_MS = 60 * 60_000;
// How far back in the queue a relearning card goes, so it isn't shown again immediately.
const REINSERT_GAP = 4;

const GRADE_META: Record<Grade, { label: string; key: string; cls: string; sel: string }> = {
  1: { label: "Again", key: "1", cls: "border-red-300 text-red-700 dark:border-red-800 dark:text-red-300", sel: "bg-red-600 text-white border-red-600 dark:bg-red-700 dark:text-white" },
  2: { label: "Hard", key: "2", cls: "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300", sel: "bg-amber-500 text-white border-amber-500 dark:bg-amber-600 dark:text-white" },
  3: { label: "Good", key: "3", cls: "border-green-300 text-green-700 dark:border-green-800 dark:text-green-300", sel: "bg-green-600 text-white border-green-600 dark:bg-green-700 dark:text-white" },
  4: { label: "Easy", key: "4", cls: "border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-300", sel: "bg-sky-600 text-white border-sky-600 dark:bg-sky-700 dark:text-white" },
};

function formatWhen(ms: number, now: number): string {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date(now).toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `in ${formatInterval(ms - now)} (${sameDay ? time : `${d.toLocaleDateString()} ${time}`})`;
}

function StudyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get("dataset") ?? "";

  const [deckName, setDeckName] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [scheduler, setScheduler] = useState<Scheduler | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [store, setStore] = useState<SrsStore>({});
  const [settings, setSettings] = useState<SrsSettings>(getSrsSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasVoice, setHasVoice] = useState(false);

  const [queue, setQueue] = useState<number[]>([]);
  const [extraNew, setExtraNew] = useState(0);
  const [freshLeft, setFreshLeft] = useState(0); // unstudied cards in the deck beyond today's queue
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [submittedTyped, setSubmittedTyped] = useState<string | null>(null);
  const [typedCorrect, setTypedCorrect] = useState<boolean | null>(null);
  const [preselect, setPreselect] = useState<Grade>(3);
  const [previews, setPreviews] = useState<{ now: number; cards: Record<Grade, SrsCard> } | null>(null);
  const composing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const gradingRef = useRef(false);

  const byNum = useMemo(() => new Map(questions.map((q) => [q.question_number, q])), [questions]);
  const currentQ = queue.length > 0 ? byNum.get(queue[0]) : undefined;
  const vocab = currentQ?.vocab;
  const typing = !!vocab && settings.typeReadings && vocab.kind === "reading" && !!vocab.reading;
  const listening = settings.listening && hasVoice;

  useEffect(() => {
    const update = () => setHasVoice(!!getJapaneseVoice());
    update();
    return onVoicesChanged(update);
  }, []);

  const startSession = useCallback(
    (qs: Question[], extra: number, newPerDay: number) => {
      const now = Date.now();
      const s = getSrs(slug);
      const allowance = Math.max(0, newPerDay + extra - newStudiedToday(s, now));
      const { due, fresh, freshTotal } = buildQueue(qs, s, allowance, now);
      setStore(s);
      setQueue([...due, ...fresh].map((q) => q.question_number));
      setFreshLeft(freshTotal - fresh.length);
      setRevealed(false);
      setTyped("");
      setSubmittedTyped(null);
      setTypedCorrect(null);
      setPreviews(null);
    },
    [slug]
  );

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    (async () => {
      try {
        const sched = getScheduler();
        const [qs, manifest] = await Promise.all([
          fetchTopicQuestions(BASE_PATH, slug, "all"),
          fetchManifest(BASE_PATH).catch(() => null),
        ]);
        setDeckName(manifest?.datasets.find((d) => d.slug === slug)?.name ?? slug);
        setQuestions(qs);
        setScheduler(() => sched);
        startSession(qs, 0, getSrsSettings().newPerDay);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, startSession]);

  // Listening cards: speak the word when the card appears (browsers may require a first tap)
  useEffect(() => {
    if (!vocab || revealed || !listening) return;
    speak(vocab.reading || vocab.word);
  }, [vocab, revealed, listening]);

  // Focus the reading input on devices with a mouse/keyboard; on phones typing is a tap away
  useEffect(() => {
    if (!typing || revealed) return;
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, [typing, revealed, currentQ]);

  const counts = useMemo(() => {
    let due = 0, fresh = 0;
    for (const n of queue) {
      const c = store[n];
      if (c && c.state !== 0) due++;
      else fresh++;
    }
    const learned = Object.values(store).filter((c) => c.state !== 0).length;
    return { due, fresh, learned };
  }, [queue, store]);

  function updateSettings(patch: Partial<SrsSettings>) {
    const next = setSrsSettings(patch);
    setSettings(next);
    if (patch.newPerDay !== undefined && !revealed) startSession(questions, extraNew, next.newPerDay);
  }

  function reveal() {
    if (!currentQ || !vocab || !scheduler || revealed) return;
    const now = Date.now();
    setPreviews({ now, cards: previewGrades(scheduler, currentQ.question_number, store[currentQ.question_number], new Date(now)) });
    if (typing && typed.trim()) {
      const ok = readingMatches(typed, vocab.reading);
      setSubmittedTyped(typed);
      setTypedCorrect(ok);
      setPreselect(ok ? 3 : 1);
    } else {
      setSubmittedTyped(null);
      setTypedCorrect(null);
      setPreselect(3);
    }
    setRevealed(true);
    inputRef.current?.blur();
    if (settings.autoPlay && hasVoice) speak(vocab.reading || vocab.word);
  }

  function grade(g: Grade) {
    if (!currentQ || !previews || !revealed || gradingRef.current) return;
    gradingRef.current = true;
    const qNum = currentQ.question_number;
    const card = previews.cards[g];
    setStore(setSrsCard(slug, qNum, card));
    const prev = getProgress(slug)[qNum];
    setQuestionProgress(slug, qNum, {
      status: g === 1 ? "incorrect" : "correct",
      selectedAnswer: [],
      attempts: (prev?.attempts ?? 0) + 1,
      lastAttempted: new Date().toISOString(),
    });
    logActivity();

    const rest = queue.slice(1);
    if (card.scheduledDays < 1 && card.due - Date.now() <= SAME_SESSION_MS) {
      rest.splice(Math.min(rest.length, REINSERT_GAP), 0, qNum);
    }
    setQueue(rest);
    setRevealed(false);
    setTyped("");
    setSubmittedTyped(null);
    setTypedCorrect(null);
    setPreviews(null);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => { gradingRef.current = false; });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (!currentQ) return;
      if (!revealed) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          reveal();
        }
        return;
      }
      if (e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        grade(Number(e.key) as Grade);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        grade(preselect);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading cards...</p>
      </div>
    );
  }

  if (error || !slug) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-destructive font-medium">Error: {error ?? "no dataset selected"}</p>
          <Button variant="outline" onClick={() => router.push("/")}>← Back</Button>
        </div>
      </div>
    );
  }

  const hasVocab = questions.some((q) => q.vocab);
  const now = Date.now();
  const nextDue = queue.length === 0 ? nextDueAt(store, now) : null;
  const moreCount = Math.min(freshLeft, Math.max(settings.newPerDay, 10));

  return (
    <main className="min-h-[100dvh] flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="mx-auto max-w-xl px-3 py-2 flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")} aria-label="Home" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{deckName} · Study</p>
            <p className="text-xs text-muted-foreground flex gap-3" data-testid="counts">
              <span><span className="font-semibold text-sky-600 dark:text-sky-400">{counts.due}</span> due</span>
              <span><span className="font-semibold text-green-600 dark:text-green-400">{counts.fresh}</span> new</span>
              <span><span className="font-semibold text-foreground">{counts.learned}</span> learned</span>
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen((o) => !o)}
            aria-label="Study settings"
            aria-expanded={settingsOpen}
            className={cn("shrink-0", settingsOpen && "bg-accent")}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <ThemeToggle />
        </div>
        {settingsOpen && (
          <div className="mx-auto max-w-xl px-4 pb-3 space-y-2 text-sm" data-testid="settings">
            <label className="flex items-center justify-between gap-3 min-h-10">
              <span>New cards per day</span>
              <input
                type="number"
                min={0}
                max={500}
                inputMode="numeric"
                value={settings.newPerDay}
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  if (!isNaN(n) && n >= 0) updateSettings({ newPerDay: Math.min(n, 500) });
                }}
                className="w-20 h-9 rounded-md border border-input bg-background px-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="New cards per day"
              />
            </label>
            {([
              ["typeReadings", "Type readings", "Type the kana reading for all-kanji words (romaji works)"],
              ["listening", "Listening cards", hasVoice ? "Hear the word first; text hidden until reveal" : "Needs a Japanese voice (none found on this device)"],
              ["autoPlay", "Auto-play audio", "Speak the word when the answer is shown"],
            ] as const).map(([k, label, hint]) => (
              <label key={k} className="flex items-center justify-between gap-3 min-h-10 cursor-pointer">
                <span>
                  {label}
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings[k]}
                  onChange={(e) => updateSettings({ [k]: e.target.checked })}
                  className="h-5 w-5 accent-[var(--primary)]"
                  aria-label={label}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 mx-auto w-full max-w-xl px-4">
        {!hasVocab ? (
          <p className="py-16 text-center text-muted-foreground">This deck has no study cards yet.</p>
        ) : currentQ && vocab ? (
          <StudyCard
            vocab={vocab}
            revealed={revealed}
            hideFront={listening}
            canSpeak={hasVoice}
            typed={submittedTyped}
            typedCorrect={typedCorrect}
            onSpeakWord={() => speak(vocab.reading || vocab.word)}
            onSpeakExample={() => vocab.ex && speak(vocab.ex.ja)}
          />
        ) : (
          <Card className="mt-10" data-testid="done">
            <CardContent className="p-8 text-center space-y-5">
              <PartyPopper className="h-14 w-14 text-yellow-500 mx-auto" />
              <div className="space-y-1">
                <h2 className="text-2xl font-bold">Done for today</h2>
                <p className="text-sm text-muted-foreground" data-testid="next-due">
                  {nextDue !== null ? <>Next review {formatWhen(nextDue, now)}</> : "No reviews scheduled yet."}
                </p>
                <p className="text-xs text-muted-foreground">{counts.learned} learned · {freshLeft} new left in this deck</p>
              </div>
              <div className="flex flex-col gap-2">
                {moreCount > 0 && (
                  <Button
                    className="h-12"
                    onClick={() => {
                      // Extend today's allowance by moreCount beyond what has already been used
                      const used = Math.max(settings.newPerDay + extraNew, newStudiedToday(store, Date.now()));
                      const extra = used + moreCount - settings.newPerDay;
                      setExtraNew(extra);
                      startSession(questions, extra, settings.newPerDay);
                    }}
                  >
                    Study {moreCount} more new cards
                  </Button>
                )}
                <Button variant="outline" className="h-12" onClick={() => router.push("/")}>← Home</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom action bar: thumb-reachable */}
      {currentQ && vocab && (
        <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-xl px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
            {!revealed ? (
              <>
                {typing && (
                  <input
                    ref={inputRef}
                    type="text"
                    lang="ja"
                    value={typed}
                    placeholder="Reading (optional) — kana or romaji"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    aria-label="Reading"
                    data-testid="reading-input"
                    onCompositionStart={() => { composing.current = true; }}
                    onCompositionEnd={(e) => { composing.current = false; setTyped(liveKana(e.currentTarget.value)); }}
                    onChange={(e) => setTyped(composing.current ? e.target.value : liveKana(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        reveal();
                      }
                    }}
                    className="w-full h-12 rounded-md border border-input bg-background px-3 text-xl text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                )}
                <Button onClick={reveal} className="w-full h-14 text-base" data-testid="reveal">
                  {typing && typed.trim() ? "Check" : "Show answer"}
                  <span className="text-xs opacity-60 hidden sm:inline">Space</span>
                </Button>
              </>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map((g) => {
                  const m = GRADE_META[g];
                  const iv = previews ? formatInterval(previews.cards[g].due - previews.now) : "";
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => grade(g)}
                      data-testid={`grade-${g}`}
                      aria-label={`${m.label}, next in ${iv}`}
                      className={cn(
                        "h-16 rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 font-semibold transition-colors active:scale-[0.97]",
                        preselect === g ? m.sel : cn("bg-background hover:bg-accent", m.cls)
                      )}
                    >
                      <span className="text-sm">{m.label}</span>
                      <span className="text-xs font-normal opacity-80">{iv}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default function StudyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <StudyContent />
    </Suspense>
  );
}
