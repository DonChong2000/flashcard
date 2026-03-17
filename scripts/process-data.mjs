import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
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
  if (!existsSync(DATA_DIR)) {
    console.log("No data/ directory found, skipping data processing.");
    return;
  }

  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json"));
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
    const questions = data.questions ?? [];

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

    for (const topic of topics) {
      const topicQuestions = topicMap.get(topic);
      const outFile = path.join(outSlugDir, `topic-${topic}.json`);
      await writeFile(outFile, JSON.stringify({ topic, questions: topicQuestions }, null, 2));
      console.log(`  Wrote ${outFile} (${topicQuestions.length} questions)`);
    }

    // Write all-topics file for "Start All"
    await writeFile(
      path.join(outSlugDir, "all.json"),
      JSON.stringify({ questions }, null, 2)
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
  await writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Wrote manifest.json with ${datasets.length} dataset(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
