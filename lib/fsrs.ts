// Thin wrapper over ts-fsrs v6 (FSRS-7). Kept apart from lib/srs.ts so the home page,
// which only counts cards, doesn't bundle the scheduler.
import { DefaultScheduler, Rating } from "ts-fsrs";
// DefaultScheduler() loads its model with a dynamic import. Importing the model statically keeps it in
// this page's chunk, so the Study page works offline without a lazily fetched chunk.
import "ts-fsrs/models/fsrs-7";
import type { SrsCard } from "./srs";

export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[];

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler>>;
let scheduler: Promise<Scheduler> | null = null;

export function getScheduler(): Promise<Scheduler> {
  // Fuzz is deterministic per card (seeded by cardId and reps), so previews match the committed review.
  return (scheduler ??= DefaultScheduler({ enableFuzz: true }));
}

const STATUS = ["new", "learning", "review", "learning"] as const;

function toFsrs(s: Scheduler, qNum: number, card: SrsCard | undefined, now: Date) {
  if (!card) return { ...s.newCard({ now }), cardId: String(qNum) };
  return {
    cardId: String(qNum),
    dueAt: new Date(card.due),
    lastReviewAt: card.last === null ? null : new Date(card.last),
    stability: card.stability,
    stabilityFast: card.stabilityFast,
    difficulty: card.difficulty,
    state: card.state,
    scheduleStatus: STATUS[card.state] ?? "review",
    reps: card.reps,
    lapses: card.lapses,
    learningStep: card.learningStep,
    scheduledDays: card.scheduledDays,
  };
}

// The resulting card for each grade. The Study page commits the chosen one, so the intervals
// shown on the buttons are exactly what gets saved.
export function previewGrades(s: Scheduler, qNum: number, card: SrsCard | undefined, now: Date): Record<Grade, SrsCard> {
  const input = toFsrs(s, qNum, card, now) as Parameters<Scheduler["review"]>[0]["card"];
  const out = {} as Record<Grade, SrsCard>;
  for (const grade of GRADES) {
    const c = s.review({ card: input, grade, now }).card;
    out[grade] = {
      due: c.dueAt.getTime(),
      last: c.lastReviewAt ? c.lastReviewAt.getTime() : null,
      stability: c.stability,
      stabilityFast: c.stabilityFast,
      difficulty: c.difficulty,
      state: c.state,
      reps: c.reps,
      lapses: c.lapses,
      learningStep: c.learningStep,
      scheduledDays: c.scheduledDays,
      first: card?.first ?? now.getTime(),
    };
  }
  return out;
}

export function formatInterval(ms: number): string {
  const m = ms / 60_000;
  if (m < 1) return "<1m";
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${(d / 30).toFixed(d < 300 ? 1 : 0).replace(/\.0$/, "")}mo`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, "")}y`;
}
