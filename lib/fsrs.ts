// Thin wrapper over ts-fsrs v6 (FSRS-7). Kept apart from lib/srs.ts so the home page,
// which only counts cards, doesn't bundle the scheduler.
import {
  dateChrono,
  defineScheduler,
  defaultLearningSteps,
  defaultRelearningSteps,
  DEFAULT_MAXIMUM_INTERVAL,
  Rating,
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerStatsMiddleware,
} from "ts-fsrs";
import { FSRS7Model, migrateFSRS7Parameters } from "ts-fsrs/models/fsrs-7";
import type { SrsCard } from "./srs";

export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[];

// Equivalent to `await DefaultScheduler({ version: "FSRS-7", enableFuzz: true })`, built synchronously:
// DefaultScheduler() loads its model through a dynamic import(), which webpack splits into a lazy chunk
// that isn't linked from study.html, so the service worker wouldn't precache it and Study would break
// offline. Importing FSRS7Model statically keeps everything in this page's own chunks.
function createScheduler() {
  const relearningSteps = [...defaultRelearningSteps];
  return defineScheduler({ model: FSRS7Model, chrono: dateChrono })
    .use(
      schedulerDesiredRetentionMiddleware,
      schedulerFuzzingMiddleware,
      schedulerStatsMiddleware,
      schedulerScheduledDaysMiddleware,
      schedulerLearningStepsMiddleware,
      schedulerMaximumIntervalMiddleware,
      schedulerMonotonicIntervalMiddleware
    )
    .create({
      config: {
        fractionalDays: true,
        weights: migrateFSRS7Parameters(),
        enableShortTerm: true,
        desiredRetention: 0.9,
        learningSteps: [...defaultLearningSteps],
        relearningSteps,
        allowModelOverride: true,
        // Fuzz is seeded per card, so it is deterministic; previews are committed as-is anyway.
        enableFuzz: true,
        maximumInterval: DEFAULT_MAXIMUM_INTERVAL,
      },
    });
}

export type Scheduler = ReturnType<typeof createScheduler>;
type CardInput = Parameters<Scheduler["review"]>[0]["card"];
let scheduler: Scheduler | null = null;

export function getScheduler(): Scheduler {
  return (scheduler ??= createScheduler());
}

const STATUS = ["new", "learning", "review", "learning"] as const;

function toFsrs(s: Scheduler, qNum: number, card: SrsCard | undefined, now: Date): CardInput {
  if (!card) return { ...s.newCard({ now }), cardId: String(qNum) };
  return {
    cardId: String(qNum),
    dueAt: new Date(card.due),
    // Clamp: a stored time is rounded to the minute (and clocks can move back), but FSRS rejects negative elapsed days.
    lastReviewAt: card.last === null ? null : new Date(Math.min(card.last, now.getTime())),
    stability: card.stability,
    stabilityFast: card.stabilityFast,
    difficulty: card.difficulty,
    state: card.state as CardInput["state"],
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
  const input = toFsrs(s, qNum, card, now);
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
