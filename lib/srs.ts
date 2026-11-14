// Spaced-repetition (Study mode) state, one store per deck under `flashcard_srs_{slug}`.
// Same discipline as lib/progress.ts: every write goes through the private save() helper.
//
// Stored shape: { v: 1, c: { [question_number]: SrsTuple } }. A tuple is
//   [due, last, stability, stabilityFast, difficulty, state, reps, lapses, learningStep, scheduledDays, first]
// with times in whole minutes since the Unix epoch (last is rounded down; 0 before the first review) and floats
// rounded to 4 decimals. ~60 bytes per card, so a fully studied N1 deck (2.7k cards) is ~160 KB.
// Only cards that have been graded at least once are stored; a missing card is "new".

import { dayKey } from "./activity";
import type { Question } from "./types";

export interface SrsCard {
  due: number; // ms
  last: number | null; // ms of last review
  stability: number;
  stabilityFast: number;
  difficulty: number;
  state: number; // 0 new, 1 learning, 2 review, 3 relearning (ts-fsrs State)
  reps: number;
  lapses: number;
  learningStep: number;
  scheduledDays: number;
  first: number; // ms of the first review; counts toward that day's new-card limit
}

export type SrsTuple = [number, number, number, number, number, number, number, number, number, number, number];
export type SrsStore = Record<number, SrsCard>;
export interface SrsExport {
  v: 1;
  c: Record<string, SrsTuple>;
}

const MIN = 60_000;
// Learning cards (sub-day intervals) may be shown this early, like Anki's learn-ahead limit.
export const LEARN_AHEAD_MS = 20 * MIN;

function key(slug: string) {
  return `flashcard_srs_${slug}`;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const toMin = (ms: number) => Math.round(ms / MIN);

function encode(c: SrsCard): SrsTuple {
  return [
    toMin(c.due), c.last === null ? 0 : Math.floor(c.last / MIN), r4(c.stability), r4(c.stabilityFast), r4(c.difficulty),
    c.state, c.reps, c.lapses, c.learningStep, r4(c.scheduledDays), toMin(c.first),
  ];
}

function decode(t: SrsTuple): SrsCard {
  return {
    due: t[0] * MIN, last: t[1] ? t[1] * MIN : null, stability: t[2], stabilityFast: t[3], difficulty: t[4],
    state: t[5], reps: t[6], lapses: t[7], learningStep: t[8], scheduledDays: t[9], first: t[10] * MIN,
  };
}

export function isSrsExport(x: unknown): x is SrsExport {
  if (!x || typeof x !== "object") return false;
  const o = x as { v?: unknown; c?: unknown };
  if (o.v !== 1 || !o.c || typeof o.c !== "object") return false;
  return Object.entries(o.c).every(
    ([k, t]) => /^\d+$/.test(k) && Array.isArray(t) && t.length === 11 && t.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function readRaw(slug: string): SrsExport {
  if (typeof window === "undefined") return { v: 1, c: {} };
  try {
    const parsed = JSON.parse(localStorage.getItem(key(slug)) ?? "null");
    return isSrsExport(parsed) ? parsed : { v: 1, c: {} };
  } catch {
    return { v: 1, c: {} };
  }
}

function save(slug: string, raw: SrsExport) {
  localStorage.setItem(key(slug), JSON.stringify(raw));
}

export function getSrs(slug: string): SrsStore {
  const store: SrsStore = {};
  for (const [k, t] of Object.entries(readRaw(slug).c)) store[Number(k)] = decode(t);
  return store;
}

export function setSrsCard(slug: string, qNum: number, card: SrsCard): SrsStore {
  const raw = readRaw(slug);
  raw.c[qNum] = encode(card);
  save(slug, raw);
  return getSrs(slug);
}

export function resetSrs(slug: string): void {
  localStorage.removeItem(key(slug));
}

// Export files (version 3) carry this raw compact form as `srs`.
export function exportSrs(slug: string): SrsExport {
  return readRaw(slug);
}

// Replace: the file's state wins outright. Merge: per card, the more recently reviewed copy wins,
// so merging is order-independent and repeatable.
export function importSrs(slug: string, data: SrsExport, merge: boolean): void {
  const raw = merge ? readRaw(slug) : { v: 1 as const, c: {} };
  for (const [k, t] of Object.entries(data.c)) {
    const mine = raw.c[k];
    if (!mine || t[1] > mine[1]) raw.c[k] = t;
  }
  save(slug, raw);
}

// ── Settings (global, all decks) ────────────────────────────────────────────

export interface SrsSettings {
  newPerDay: number;
  typeReadings: boolean; // opt-in typed-reading input on kind "reading" cards
  listening: boolean; // opt-in: front speaks the word and hides the text
  autoPlay: boolean; // speak the word once on reveal
}

const SETTINGS_KEY = "flashcard_srs_settings";
export const DEFAULT_SRS_SETTINGS: SrsSettings = { newPerDay: 20, typeReadings: false, listening: false, autoPlay: true };

export function getSrsSettings(): SrsSettings {
  if (typeof window === "undefined") return DEFAULT_SRS_SETTINGS;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    return {
      newPerDay: Number.isInteger(s.newPerDay) && s.newPerDay >= 0 ? s.newPerDay : DEFAULT_SRS_SETTINGS.newPerDay,
      typeReadings: typeof s.typeReadings === "boolean" ? s.typeReadings : DEFAULT_SRS_SETTINGS.typeReadings,
      listening: typeof s.listening === "boolean" ? s.listening : DEFAULT_SRS_SETTINGS.listening,
      autoPlay: typeof s.autoPlay === "boolean" ? s.autoPlay : DEFAULT_SRS_SETTINGS.autoPlay,
    };
  } catch {
    return DEFAULT_SRS_SETTINGS;
  }
}

export function setSrsSettings(patch: Partial<SrsSettings>): SrsSettings {
  const next = { ...getSrsSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

// ── Scheduling queries ──────────────────────────────────────────────────────

function startOfTomorrow(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// Day-scale reviews are due for the whole local day they fall on; learning steps are due on the minute
// (with a short learn-ahead), so a session never stalls on a card coming back in a few minutes.
export function isDue(card: SrsCard, now: number): boolean {
  if (card.state === 0) return false;
  return card.scheduledDays >= 1 ? card.due < startOfTomorrow(now) : card.due <= now + LEARN_AHEAD_MS;
}

export function newStudiedToday(store: SrsStore, now: number): number {
  const today = dayKey(new Date(now));
  let n = 0;
  for (const c of Object.values(store)) if (dayKey(new Date(c.first)) === today) n++;
  return n;
}

export interface SrsSummary {
  due: number;
  newToday: number; // new cards still available today under the daily limit
  learned: number; // cards graded at least once
}

// For the home page: totalCards is the deck size (every vocab question carries `vocab`).
export function srsSummary(store: SrsStore, totalCards: number, newPerDay: number, now = Date.now()): SrsSummary {
  const cards = Object.values(store);
  const learned = cards.filter((c) => c.state !== 0).length;
  const due = cards.filter((c) => isDue(c, now)).length;
  const allowance = Math.max(0, newPerDay - newStudiedToday(store, now));
  return { due, newToday: Math.min(allowance, Math.max(0, totalCards - learned)), learned };
}

// Due cards (oldest due first), then up to `newLimit` new cards in ascending vocab.rank.
export function buildQueue(questions: Question[], store: SrsStore, newLimit: number, now: number) {
  const vocabQs = questions.filter((q) => q.vocab);
  const due = vocabQs
    .filter((q) => store[q.question_number] && isDue(store[q.question_number], now))
    .sort((a, b) => store[a.question_number].due - store[b.question_number].due);
  const fresh = vocabQs
    .filter((q) => !store[q.question_number] || store[q.question_number].state === 0)
    .sort((a, b) => a.vocab!.rank - b.vocab!.rank || a.question_number - b.question_number);
  return { due, fresh: fresh.slice(0, Math.max(0, newLimit)), freshTotal: fresh.length };
}

// Earliest future due time, for the "done for today" screen.
export function nextDueAt(store: SrsStore, now: number): number | null {
  let best: number | null = null;
  for (const c of Object.values(store)) {
    if (c.state === 0 || isDue(c, now)) continue;
    if (best === null || c.due < best) best = c.due;
  }
  return best;
}
