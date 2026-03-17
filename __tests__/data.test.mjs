import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

const VALID_ANSWER_KEYS = new Set(["A", "B", "C", "D", "E", "F"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadDataFiles() {
  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json"));
  return Promise.all(
    files.map(async (file) => {
      const raw = await readFile(path.join(DATA_DIR, file), "utf-8");
      return { file, data: JSON.parse(raw) };
    })
  );
}

describe("data/*.json source files", () => {
  let entries;

  beforeAll(async () => {
    entries = await loadDataFiles();
  });

  test("at least one data file exists", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  test("each file has a non-empty top-level questions array", () => {
    for (const { file, data } of entries) {
      assert(Array.isArray(data.questions), `${file}: "questions" must be an array`);
      assert(data.questions.length > 0, `${file}: "questions" must not be empty`);
    }
  });

  test("question_number is a positive integer, unique within each file", () => {
    for (const { file, data } of entries) {
      const seen = new Set();
      for (const q of data.questions) {
        const id = `${file} #${q.question_number}`;
        assert(typeof q.question_number === "number", `${id}: question_number must be a number`);
        assert(Number.isInteger(q.question_number), `${id}: question_number must be an integer`);
        assert(q.question_number > 0, `${id}: question_number must be > 0`);
        assert(!seen.has(q.question_number), `${file}: duplicate question_number ${q.question_number}`);
        seen.add(q.question_number);
      }
    }
  });

  test("topic is a positive integer when present", () => {
    for (const { file, data } of entries) {
      for (const q of data.questions) {
        if (q.topic !== undefined) {
          const id = `${file} #${q.question_number}`;
          assert(typeof q.topic === "number", `${id}: topic must be a number`);
          assert(q.topic >= 1, `${id}: topic must be >= 1`);
        }
      }
    }
  });

  test("question is a non-empty string", () => {
    for (const { file, data } of entries) {
      for (const q of data.questions) {
        const id = `${file} #${q.question_number}`;
        assert(typeof q.question === "string", `${id}: question must be a string`);
        assert(q.question.trim().length > 0, `${id}: question must not be blank`);
      }
    }
  });

  test("options has at least 2 valid-key string entries", () => {
    for (const { file, data } of entries) {
      for (const q of data.questions) {
        const id = `${file} #${q.question_number}`;
        assert(q.options !== null && typeof q.options === "object", `${id}: options must be an object`);
        const keys = Object.keys(q.options);
        assert(keys.length >= 2, `${id}: must have at least 2 options, got ${keys.length}`);
        for (const [key, val] of Object.entries(q.options)) {
          assert(VALID_ANSWER_KEYS.has(key), `${id}: invalid option key "${key}"`);
          assert(typeof val === "string", `${id}: option "${key}" must be a string`);
          assert(val.trim().length > 0, `${id}: option "${key}" must not be blank`);
        }
      }
    }
  });

  test("correct_answer is a non-empty array of keys that exist in options", () => {
    for (const { file, data } of entries) {
      for (const q of data.questions) {
        const id = `${file} #${q.question_number}`;
        assert(Array.isArray(q.correct_answer), `${id}: correct_answer must be an array`);
        assert(q.correct_answer.length > 0, `${id}: correct_answer must not be empty`);
        for (const ans of q.correct_answer) {
          assert(VALID_ANSWER_KEYS.has(ans), `${id}: correct_answer key "${ans}" is not a valid option letter`);
          assert(Object.keys(q.options).includes(ans), `${id}: correct_answer "${ans}" not present in options`);
        }
      }
    }
  });

  test("community_votes uses valid option keys with numeric values", () => {
    for (const { file, data } of entries) {
      for (const q of data.questions) {
        if (!q.community_votes || Object.keys(q.community_votes).length === 0) continue;
        const id = `${file} #${q.question_number}`;
        for (const [key, val] of Object.entries(q.community_votes)) {
          assert(VALID_ANSWER_KEYS.has(key), `${id}: community_votes key "${key}" is invalid`);
          assert(typeof val === "number", `${id}: community_votes["${key}"] must be a number`);
        }
      }
    }
  });
});
