import type { ProgressStore, QuestionProgress } from "./types";

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
): void {
  const store = getProgress(slug);
  const existing = store[qNum] ?? { ...DEFAULT_PROGRESS };
  store[qNum] = { ...existing, ...data };
  save(slug, store);
}

export function toggleBookmark(slug: string, qNum: number): boolean {
  const store = getProgress(slug);
  const existing = store[qNum] ?? { ...DEFAULT_PROGRESS };
  const newBookmarked = !existing.bookmarked;
  store[qNum] = { ...existing, bookmarked: newBookmarked };
  save(slug, store);
  return newBookmarked;
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
