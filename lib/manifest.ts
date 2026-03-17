import type { Manifest, Question } from "./types";

let cached: Manifest | null = null;

export async function fetchManifest(basePath = ""): Promise<Manifest> {
  if (cached) return cached;
  const res = await fetch(`${basePath}/data/manifest.json`);
  if (!res.ok) throw new Error("Failed to load manifest");
  cached = await res.json();
  return cached!;
}

const VALID_KEYS = new Set(["A", "B", "C", "D", "E", "F"]);

function validateQuestion(q: Question): string | null {
  if (!q.options || typeof q.options !== "object") return "missing options";
  const keys = Object.keys(q.options);
  if (keys.length < 2) return `only ${keys.length} option(s)`;
  if (!Array.isArray(q.correct_answer) || q.correct_answer.length === 0) return "missing correct_answer";
  for (const ans of q.correct_answer) {
    if (!VALID_KEYS.has(ans)) return `invalid correct_answer key "${ans}"`;
    if (!q.options[ans]) return `correct_answer "${ans}" not in options`;
  }
  return null;
}

export async function fetchTopicQuestions(
  basePath: string,
  slug: string,
  topic: number | "all"
): Promise<Question[]> {
  const file = topic === "all" ? "all.json" : `topic-${topic}.json`;
  const res = await fetch(`${basePath}/data/${slug}/${file}`);
  if (!res.ok) throw new Error(`Failed to load ${file}`);
  const data = await res.json();
  const questions = data.questions as Question[];
  const valid: Question[] = [];
  for (const q of questions) {
    const reason = validateQuestion(q);
    if (reason) {
      console.warn(`[flashcard] Skipping Q${q.question_number}: ${reason}`);
    } else {
      valid.push(q);
    }
  }
  return valid;
}
