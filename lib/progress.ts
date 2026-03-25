import type { ProgressStore, QuestionProgress } from "./types";
import { numbersToHex, hexToNumbers } from "./bitmap";

const DEFAULT_PROGRESS: QuestionProgress = {
  status: "unseen",
  selectedAnswer: [],
  attempts: 0,
  lastAttempted: "",
  bookmarked: false,
};

function key(slug: string) {
  return `flashcard_progress_${slug}`;
}

export function getProgress(slug: string): ProgressStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(key(slug));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(slug: string, store: ProgressStore) {
  localStorage.setItem(key(slug), JSON.stringify(store));
}

export function setQuestionProgress(
  slug: string,
  qNum: number,
  data: Partial<QuestionProgress>
): ProgressStore {
  const store = getProgress(slug);
  const existing = store[qNum] ?? { ...DEFAULT_PROGRESS };
  store[qNum] = { ...existing, ...data };
  save(slug, store);
  return store;
}

export function toggleBookmark(slug: string, qNum: number): ProgressStore {
  const store = getProgress(slug);
  const existing = store[qNum] ?? { ...DEFAULT_PROGRESS };
  const newBookmarked = !existing.bookmarked;
  store[qNum] = { ...existing, bookmarked: newBookmarked };
  save(slug, store);
  return store;
}

export function resetProgress(slug: string): void {
  localStorage.removeItem(key(slug));
}

export function getBookmarkedIds(slug: string): number[] {
  const store = getProgress(slug);
  return Object.entries(store)
    .filter(([, v]) => v.bookmarked)
    .map(([k]) => Number(k));
}

export function getIncorrectIds(slug: string): number[] {
  const store = getProgress(slug);
  return Object.entries(store)
    .filter(([, v]) => v.status === "incorrect")
    .map(([k]) => Number(k));
}

export interface ProgressExport {
  version: number;
  question_set: string;
  date: string;
  correct: string;
  incorrect: string;
  bookmarked: string;
}

export function exportProgress(slug: string, totalQuestions: number): ProgressExport {
  const store = getProgress(slug);
  const correctNums: number[] = [];
  const incorrectNums: number[] = [];
  const bookmarkedNums: number[] = [];
  for (const [k, v] of Object.entries(store)) {
    const n = Number(k);
    if (v.status === "correct") correctNums.push(n);
    else if (v.status === "incorrect") incorrectNums.push(n);
    if (v.bookmarked) bookmarkedNums.push(n);
  }
  return {
    version: 1,
    question_set: slug,
    date: new Date().toISOString(),
    correct: numbersToHex(correctNums, totalQuestions),
    incorrect: numbersToHex(incorrectNums, totalQuestions),
    bookmarked: numbersToHex(bookmarkedNums, totalQuestions),
  };
}

export function importProgress(
  slug: string,
  data: ProgressExport,
  totalQuestions: number,
  merge = false
): void {
  const correctSet = new Set(hexToNumbers(data.correct, totalQuestions));
  const incorrectSet = new Set(hexToNumbers(data.incorrect, totalQuestions));
  const bookmarkedSet = new Set(hexToNumbers(data.bookmarked, totalQuestions));

  const existing = merge ? getProgress(slug) : {};
  const store: ProgressStore = { ...existing };

  const allNums = new Set([...correctSet, ...incorrectSet, ...bookmarkedSet]);
  for (const n of allNums) {
    if (merge && store[n] && store[n].status !== "unseen") continue;
    const isCorrect = correctSet.has(n);
    const isIncorrect = incorrectSet.has(n);
    const isBookmarked = bookmarkedSet.has(n);
    store[n] = {
      status: isCorrect ? "correct" : isIncorrect ? "incorrect" : "unseen",
      bookmarked: isBookmarked,
      selectedAnswer: [],
      attempts: isCorrect || isIncorrect ? 1 : 0,
      lastAttempted: isCorrect || isIncorrect ? data.date : "",
    };
  }

  save(slug, store);
}
