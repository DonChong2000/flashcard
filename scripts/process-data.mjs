import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT_DIR = path.join(ROOT, "public", "data");

function slugify(filename) {
  return path.basename(filename, ".json").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

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

    datasets.push({
      slug,
      name: humanize(slug),
      totalQuestions: questions.length,
      topics,
    });

    console.log(`Processed ${file} → ${slug} (${questions.length} questions, ${topics.length} topics)`);
  }

  const manifest = { datasets };
  await writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest));
  console.log(`Wrote manifest.json with ${datasets.length} dataset(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
