import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT_DIR = path.join(ROOT, "public", "data");

function slugify(filename) {
  return path.basename(filename, ".json").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

// Datasets without a top-level `order` sort after every ordered one.
const DEFAULT_ORDER = 999;

function humanize(slug) {
  return slug
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function main() {
  let files;
  try {
    files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json"));
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log("No data/ directory found, skipping data processing.");
      return;
    }
    throw e;
  }
  if (files.length === 0) {
    console.log("No JSON files found in data/, skipping.");
    return;
  }

  // Start clean so decks removed from data/ don't linger in public/data/ (and out/)
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const datasets = [];

  for (const file of files) {
    const slug = slugify(file);
    const raw = await readFile(path.join(DATA_DIR, file), "utf-8");
    const data = JSON.parse(raw);
    const allQuestions = data.questions ?? [];
    const questions = allQuestions.filter((q) => Array.isArray(q.correct_answer) && q.correct_answer.length > 0);
    if (questions.length < allQuestions.length) {
      console.log(`  Skipped ${allQuestions.length - questions.length} questions with missing correct_answer`);
    }

    // Group by topic
    const topicMap = new Map();
    for (const q of questions) {
      const t = q.topic ?? 1;
      if (!topicMap.has(t)) topicMap.set(t, []);
      topicMap.get(t).push(q);
    }

    const topics = [...topicMap.keys()].sort((a, b) => a - b);
    const outSlugDir = path.join(OUT_DIR, slug);
    await mkdir(outSlugDir, { recursive: true });

    await Promise.all(
      topics.map((topic) => {
        const topicQuestions = topicMap.get(topic);
        const outFile = path.join(outSlugDir, `topic-${topic}.json`);
        return writeFile(outFile, JSON.stringify({ topic, questions: topicQuestions }))
          .then(() => console.log(`  Wrote ${outFile} (${topicQuestions.length} questions)`));
      })
    );

    // Write all-topics file for "Start All"
    await writeFile(
      path.join(outSlugDir, "all.json"),
      JSON.stringify({ questions })
    );

    const topicQuestions = Object.fromEntries(
      topics.map((topic) => [topic, topicMap.get(topic).map((q) => q.question_number)])
    );

    const tagMap = new Map();
    for (const q of questions) {
      for (const tag of (q.tags ?? [])) {
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag).push(q.question_number);
      }
    }
    const tagQuestions = Object.fromEntries([...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0])));

    datasets.push({
      slug,
      name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : humanize(slug),
      order: typeof data.order === "number" ? data.order : DEFAULT_ORDER,
      totalQuestions: questions.length,
      topics,
      topicQuestions,
      tagQuestions,
      ...(data.topic_names && { topicNames: data.topic_names }),
      ...(data.study === true && { study: true }),
    });

    console.log(`Processed ${file} → ${slug} (${questions.length} questions, ${topics.length} topics)`);
  }

  // Sort by `order`, then display name; the first entry is the default selection.
  datasets.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const manifest = { datasets };
  await writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest));
  console.log(`Wrote manifest.json with ${datasets.length} dataset(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
