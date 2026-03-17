import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

const VALID_ANSWER_KEYS = new Set(["A", "B", "C", "D", "E", "F"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectErrors(fn) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  fn(check);
  if (errors.length > 0) throw new Error(`${errors.length} error(s):\n` + errors.join("\n"));
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
    collectErrors((check) => {
      for (const { file, data } of entries) {
        const seen = new Set();
        for (const q of data.questions) {
          const id = `${file} #${q.question_number}`;
          check(typeof q.question_number === "number", `${id}: question_number must be a number`);
          check(Number.isInteger(q.question_number), `${id}: question_number must be an integer`);
          check(q.question_number > 0, `${id}: question_number must be > 0`);
          check(!seen.has(q.question_number), `${file}: duplicate question_number ${q.question_number}`);
          seen.add(q.question_number);
        }
      }
    });
  });

  test("topic is a positive integer when present", () => {
    collectErrors((check) => {
      for (const { file, data } of entries) {
        for (const q of data.questions) {
          if (q.topic !== undefined) {
            const id = `${file} #${q.question_number}`;
            check(typeof q.topic === "number", `${id}: topic must be a number`);
            check(q.topic >= 1, `${id}: topic must be >= 1`);
          }
        }
      }
    });
  });

  test("question is a non-empty string", () => {
    collectErrors((check) => {
      for (const { file, data } of entries) {
        for (const q of data.questions) {
          const id = `${file} #${q.question_number}`;
          check(typeof q.question === "string", `${id}: question must be a string`);
          check(q.question.trim().length > 0, `${id}: question must not be blank`);
        }
      }
    });
  });

  test("options has at least 2 valid-key string entries", () => {
    collectErrors((check) => {
      for (const { file, data } of entries) {
        for (const q of data.questions) {
          const id = `${file} #${q.question_number}`;
          check(q.options !== null && typeof q.options === "object", `${id}: options must be an object`);
          const keys = Object.keys(q.options);
          check(keys.length >= 2, `${id}: must have at least 2 options, got ${keys.length}`);
          for (const [key, val] of Object.entries(q.options)) {
            check(VALID_ANSWER_KEYS.has(key), `${id}: invalid option key "${key}"`);
            check(typeof val === "string", `${id}: option "${key}" must be a string`);
            check(val.trim().length > 0, `${id}: option "${key}" must not be blank`);
          }
        }
      }
    });
  });

  test("correct_answer is a non-empty array of keys that exist in options", () => {
    collectErrors((check) => {
      for (const { file, data } of entries) {
        for (const q of data.questions) {
          const id = `${file} #${q.question_number}`;
          check(Array.isArray(q.correct_answer), `${id}: correct_answer must be an array`);
          if (!Array.isArray(q.correct_answer)) continue;
          check(q.correct_answer.length > 0, `${id}: correct_answer must not be empty`);
          for (const ans of q.correct_answer) {
            check(VALID_ANSWER_KEYS.has(ans), `${id}: correct_answer key "${ans}" is not a valid option letter`);
            check(Object.keys(q.options).includes(ans), `${id}: correct_answer "${ans}" not present in options`);
          }
        }
      }
    });
  });

  test("community_votes uses valid option keys with numeric values", () => {
    collectErrors((check) => {
      for (const { file, data } of entries) {
        for (const q of data.questions) {
          if (!q.community_votes || Object.keys(q.community_votes).length === 0) continue;
          const id = `${file} #${q.question_number}`;
          for (const [key, val] of Object.entries(q.community_votes)) {
            check(
              key === "other" || (key.length > 0 && [...key].every((k) => VALID_ANSWER_KEYS.has(k))),
              `${id}: community_votes key "${key}" is invalid`
            );
            check(typeof val === "number", `${id}: community_votes["${key}"] must be a number`);
          }
        }
      }
    });
  });
});
