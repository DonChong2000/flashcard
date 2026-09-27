export interface DiscussionEntry {
  username: string;
  timestamp: string;
  upvotes: number;
  comment: string;
  selected: string[];
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
}

export interface TopicFile {
  topic?: number;
  questions: Question[];
}

export interface DatasetMeta {
  slug: string;
  name: string;
  totalQuestions: number;
  topics: number[];
  topicQuestions: Record<number, number[]>;
  tagQuestions: Record<string, number[]>;
  topicNames?: Record<number, string>;
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
