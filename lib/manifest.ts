import type { Manifest, Question } from "./types";

let cached: Manifest | null = null;

export async function fetchManifest(basePath = ""): Promise<Manifest> {
  if (cached) return cached;
  const res = await fetch(`${basePath}/data/manifest.json`);
  if (!res.ok) throw new Error("Failed to load manifest");
  cached = await res.json();
  return cached!;
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
  return data.questions as Question[];
}
