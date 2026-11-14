export interface DiscussionEntry {
  username: string;
  timestamp: string;
  upvotes: number;
  comment: string;
  selected: string[];
}

// Vocab decks only (see data-src/vocab/CONTRACT.md)
export interface VocabInfo {
  word: string;
  reading: string; // kana; may be ""
  zh: string;
  en: string;
  kind: "reading" | "meaning"; // reading: all-kanji word, test the reading; meaning: contains kana
  same: boolean; // same word and meaning in Chinese
  trap: boolean; // all-kanji false friend / Japan-only word
  rank: number; // 1 = study first
  ex?: { ja: string; zh: string };
}

export interface Question {
  question_number: number;
  topic: number;
  tags?: string[];
  question: string;
  image?: string; // path under basePath, e.g. media/jlpt_n5/2018-07/L1-1.jpg
  audio?: string;
  options: Record<string, string>;
  correct_answer: string[];
  community_votes: Record<string, number>;
  discussion: DiscussionEntry[];
  vocab?: VocabInfo;
}

export interface TopicFile {
  topic?: number;
  questions: Question[];
}

export interface DatasetMeta {
  slug: string;
  name: string; // source `name`, or the humanized slug
  order: number; // source `order`, default 999; manifest is sorted by order then name
  totalQuestions: number;
  topics: number[];
  topicQuestions: Record<number, number[]>;
  tagQuestions: Record<string, number[]>;
  topicNames?: Record<number, string>;
  study?: boolean; // deck-level `study: true`: enables the spaced-repetition Study mode
}

export interface Manifest {
  datasets: DatasetMeta[];
}

export interface QuestionProgress {
  status: "correct" | "incorrect" | "unseen";
  selectedAnswer: string[];
  attempts: number;
  lastAttempted: string;
  bookmarked: boolean;
}

export type ProgressStore = Record<number, QuestionProgress>;

export const QUIZ_FILTERS = ["all", "correct", "incorrect", "unseen", "bookmarked", "bookmarked+incorrect"] as const;
export type QuizFilter = (typeof QUIZ_FILTERS)[number];
