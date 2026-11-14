#!/usr/bin/env node
// Build data/Vocab-N{L}.json from data-src/vocab/n{L}.json (one card per word: Japanese -> zh gloss).
//
//   node scripts/build-vocab.mjs [5 4 ...]     (default: every level whose source exists)
//
// Everything random is seeded from stable ids, so the output only changes when the source does:
// - topic (set of ≤100 words): a seeded shuffle of the level, split into equal sets
// - correct letter: balanced A–D within each block of 4 consecutive ids
// - distractors: same level, preferring the same rough part of speech and a similar gloss length,
//   never a gloss that equals or overlaps the correct one or another option

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "data-src", "vocab");
const OUT_DIR = path.join(ROOT, "data");
const ORDER = { 5: 21, 4: 22, 3: 23, 2: 24, 1: 25 };
const SET_SIZE = 100;
const LETTERS = ["A", "B", "C", "D"];

// ---------- seeded randomness ----------
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function rng(seed) {
  let a = hash32(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- Japanese headword cleanup ----------
// Source forms: "足; 脚", "こす (みずを～)", "(かさを～) さす", "パート (タイム)", "～(て) しまう", "しまった (かん)".
// Returns { main, note, interj }: main is one line (alternatives joined with ／, optional parts in （）),
// note is a usage hint such as （みずを～） shown on its own line.
function cleanJa(s) {
  let interj = false;
  const notes = [];
  let t = (s ?? "").replace(/[〜~]/g, "～").trim();
  t = t.replace(/\s*[(（]([^()（）]*)[)）]\s*/g, (m, inner, off, whole) => {
    inner = inner.trim().replace(/。/g, "、");
    if (inner === "かん") { interj = true; return " "; }
    const atEdge = off === 0 || off + m.length === whole.length;
    // A collocation hint ("みずを～", "はじを", "をつかむ") at either end goes on its own line;
    // anything else ("タイム", "にほんいち", "て") is an optional part or example and stays inline.
    if (atEdge && (inner.includes("～") || /[をがにで]$/.test(inner) || /^を/.test(inner))) {
      let n = inner;
      if (!n.includes("～")) n = /^を/.test(n) ? "～" + n : n + "～";
      notes.push(`（${n}）`);
      return " ";
    }
    return `（${inner}）`;
  });
  const parts = t.split(/\s*;\s*/).map((p) => p.replace(/\s+/g, " ").trim().replace(/ (?=[^\x00-\x7f])|(?<=[^\x00-\x7f]) /g, ""))
    .filter(Boolean);
  // "堅; 硬; 固い" lists kanji sharing the last one's okurigana
  const last = /^(\p{Script=Han}+)(\p{Script=Hiragana}+)$/u.exec(parts.at(-1) ?? "");
  if (last) for (let i = 0; i < parts.length - 1; i++)
    if (/^\p{Script=Han}+$/u.test(parts[i]) && parts[i].length === last[1].length) parts[i] += last[2];
  const main = parts.join("／");
  return { main, note: notes.join(""), interj };
}

// ---------- rough part of speech from the English gloss ----------
const NOUN_LY = new Set(["family", "assembly", "supply", "reply", "jelly", "ally", "belly", "lily", "rally", "bully", "fly", "butterfly", "july", "italy", "monopoly", "anomaly", "melancholy", "folly", "homily", "panoply"]);
const ADVERBS = new Set(["often", "always", "already", "still", "soon", "very", "quite", "again", "together", "almost", "just", "perhaps", "maybe", "never", "sometimes", "rather", "too", "also", "even", "once", "now", "later", "yet", "instead", "afterwards", "beforehand", "first of all", "at once", "a little", "more", "most", "anyway", "somehow", "otherwise", "therefore", "however", "namely"]);
const INTERJ = /^(ah|oh|hey|hello|wow|alas|goodbye|good-bye|thanks?|thank you|excuse me|sorry|congratulations|good (morning|afternoon|evening|night)|welcome|bye)\b/;
const NOUN_CUE = /^(a|an|the) |(tion|sion|ment|ness|ance|ence|ship|ism|hood|dom)$/;

// Nouns made from godan verbs (戦う → 戦い, 間違う → 間違い, 遣う → 小遣い) look like い-adjectives.
// `verbStems` holds "戦", "間違", "たたか", ... for every "to …" word ending in う across the levels.
function isVerbNoun(head, verbStems) {
  if (!head.endsWith("い")) return false;
  const body = head.slice(0, -1);
  for (let i = 0; i < body.length; i++) {
    const stem = body.slice(i);
    if ((stem.length >= 2 || /\p{Script=Han}/u.test(stem)) && verbStems.has(stem)) return true;
  }
  return false;
}

function partOfSpeech({ main, interj }, en, verbStems) {
  const first = en.split(/[;,]/)[0].replace(/\([^)]*\)/g, "").trim().toLowerCase();
  const single = !first.includes(" ");
  const head = main.split("／").pop();
  if (interj || ((/!/.test(en) || INTERJ.test(first)) && !/\p{Script=Han}/u.test(head))) return "interj";
  if (/^～|～$/.test(head) || /\b(suffix|prefix|counter)\b/i.test(en) || /^~|~$/.test(first)) return "affix";
  if (/^to /.test(first) || /する$/.test(head)) return "verb";
  if (/い$/.test(head) && !/(なさい|ください)$/.test(head) && !NOUN_CUE.test(first) && !isVerbNoun(head, verbStems)) return "adj";
  if (/的$/.test(head)) return "adj";
  if (ADVERBS.has(first) || (single && /ly$/.test(first) && !NOUN_LY.has(first))) return "adv";
  if (single && first.length >= 7 && /(ous|ful|ive|ible|able|less|ical)$/.test(first)) return "adj";
  return "noun";
}
const POS_TAG = { verb: "動詞", noun: "名詞", adj: "形容詞", adv: "副詞", affix: "其他", interj: "其他" };

// ---------- gloss overlap ----------
const FILLER = new Set([..."的地得之了一某人者物事等"]);
const senses = (g) => g.replace(/（[^）]*）/g, "").split(/[；;，,、／/]/).map((s) => s.trim()).filter(Boolean);
const hanSet = (g) => new Set([...g.replace(/（[^）]*）/g, "")].filter((c) => /\p{Script=Han}/u.test(c) && !FILLER.has(c)));
function overlaps(a, b) {
  if (a.zh === b.zh) return true;
  const sa = a.senses, sb = b.senses;
  if (sa.some((x) => sb.includes(x))) return true;
  const na = a.zh.replace(/[（）；，、／\s]/g, ""), nb = b.zh.replace(/[（）；，、／\s]/g, "");
  if (Math.min(na.length, nb.length) >= 2 && (na.includes(nb) || nb.includes(na))) return true;
  let inter = 0;
  for (const c of a.han) if (b.han.has(c)) inter++;
  const union = a.han.size + b.han.size - inter;
  return union > 0 && inter / union >= 0.5;
}

// Verb stems from every level present, for isVerbNoun.
const VERB_STEMS = new Set();
for (const f of fs.existsSync(SRC_DIR) ? fs.readdirSync(SRC_DIR).filter((f) => /^n\d\.json$/.test(f)) : []) {
  for (const x of JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), "utf8"))) {
    if (!/^to /i.test(x.en.trim())) continue;
    for (const form of [x.expression, x.reading]) {
      const v = cleanJa(form).main.split("／").pop();
      if (v.endsWith("う") && v.length >= 2) VERB_STEMS.add(v.slice(0, -1));
    }
  }
}

// ---------- build one level ----------
function buildLevel(L) {
  const srcFile = path.join(SRC_DIR, `n${L}.json`);
  const source = JSON.parse(fs.readFileSync(srcFile, "utf8"));
  const problems = [];

  let words = source.map((x) => {
    const ja = cleanJa(x.expression);
    const rd = cleanJa(x.reading);
    const zh = String(x.zh).replace(/[\r\n]+/g, "；").trim();
    return {
      id: x.id, ja, en: x.en.trim(), zh,
      reading: rd.main && rd.main !== ja.main ? rd.main : "",
      pos: partOfSpeech(ja, x.en, VERB_STEMS), senses: senses(zh), han: hanSet(zh),
    };
  });

  // Same headword twice: show the reading in the question; identical headword+reading: keep the first.
  const byMain = new Map();
  for (const w of words) (byMain.get(w.ja.main) ?? byMain.set(w.ja.main, []).get(w.ja.main)).push(w);
  const dropped = new Set();
  for (const group of byMain.values()) {
    if (group.length < 2) continue;
    const seen = new Map();
    for (const w of group) {
      const key = w.reading || w.ja.main;
      if (seen.has(key)) { dropped.add(w.id); problems.push(`dropped id ${w.id} ${w.ja.main}: same word and reading as id ${seen.get(key)}`); continue; }
      seen.set(key, w.id);
      w.disambiguate = true;
    }
  }
  words = words.filter((w) => !dropped.has(w.id));
  for (const w of words) {
    const head = w.disambiguate && w.reading ? `${w.ja.main}（${w.reading}）` : w.ja.main;
    w.question = w.ja.note ? `${head}\n${w.ja.note}` : head;
    w.explainHead = (w.reading ? `${w.ja.main}（${w.reading}）` : w.ja.main) + w.ja.note;
  }

  // Topics: seeded order, cut into equal sets of at most SET_SIZE.
  const order = [...words].sort((a, b) => hash32(`vocab-topic:n${L}:${a.id}`) - hash32(`vocab-topic:n${L}:${b.id}`) || a.id - b.id);
  const nSets = Math.ceil(order.length / SET_SIZE);
  order.forEach((w, rank) => { w.topic = Math.floor((rank * nSets) / order.length) + 1; w.rank = rank; });

  const byPos = new Map();
  for (const w of words) (byPos.get(w.pos) ?? byPos.set(w.pos, []).get(w.pos)).push(w);
  const len = (w) => [...w.zh].length;
  const similarLength = (a, b) => Math.abs(len(a) - len(b)) <= 2 || (len(b) / len(a) >= 0.6 && len(b) / len(a) <= 1.67);
  const sameHead = (a, b) => a.ja.main === b.ja.main;

  const questions = [];
  for (const w of order) {
    const rand = rng(`vocab-distractor:n${L}:${w.id}`);
    const picked = [];
    const ok = (c) => c !== w && !sameHead(c, w) && !overlaps(c, w) && picked.every((p) => p !== c && !overlaps(p, c));
    const samePos = shuffle(byPos.get(w.pos), rand);
    const all = shuffle(words, rand);
    const tiers = [
      samePos.filter((c) => similarLength(w, c)),
      samePos,
      all.filter((c) => similarLength(w, c)),
      all,
    ];
    for (const tier of tiers) {
      for (const c of tier) { if (picked.length === 3) break; if (ok(c)) picked.push(c); }
      if (picked.length === 3) break;
    }
    if (picked.length < 3) throw new Error(`n${L} id ${w.id}: could not find 3 distractors`);

    const block = Math.floor((w.id - 1) / 4);
    const pos = shuffle([0, 1, 2, 3], rng(`vocab-letter:n${L}:${block}`))[(w.id - 1) % 4];
    const slots = [];
    let d = 0;
    for (let i = 0; i < 4; i++) slots.push(i === pos ? w : picked[d++]);
    const options = Object.fromEntries(slots.map((s, i) => [LETTERS[i], s.zh]));
    const answer = LETTERS[pos];
    questions.push({
      question_number: w.id,
      topic: w.topic,
      question: w.question,
      options,
      correct_answer: [answer],
      tags: [POS_TAG[w.pos]],
      discussion: [{ username: "解釋", upvotes: 0, comment: `${w.explainHead}\n${w.zh}\n${w.en}`, selected: [answer] }],
    });
  }

  const topic_names = Object.fromEntries(Array.from({ length: nSets }, (_, i) => [String(i + 1), `第 ${i + 1} 組`]));
  const out = { name: `N${L} 詞彙`, order: ORDER[L], total_questions: questions.length, topic_names, questions };
  const outFile = path.join(OUT_DIR, `Vocab-N${L}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");

  const posCount = {};
  for (const w of words) posCount[POS_TAG[w.pos]] = (posCount[POS_TAG[w.pos]] ?? 0) + 1;
  const letterCount = { A: 0, B: 0, C: 0, D: 0 };
  for (const q of questions) letterCount[q.correct_answer[0]]++;
  console.log(`Wrote ${path.relative(ROOT, outFile)}: ${questions.length} cards in ${nSets} sets; ` +
    `answers ${Object.entries(letterCount).map(([k, v]) => k + v).join(" ")}; ` +
    Object.entries(posCount).map(([k, v]) => `${k} ${v}`).join(", "));
  for (const p of problems) console.log(`  note: ${p}`);
}

const requested = process.argv.slice(2).map((a) => Number(String(a).replace(/^n/i, "")));
const levels = requested.length ? requested : [5, 4, 3, 2, 1].filter((L) => fs.existsSync(path.join(SRC_DIR, `n${L}.json`)));
if (levels.length === 0) { console.log("No data-src/vocab/n*.json found; nothing to build."); process.exit(0); }
for (const L of levels) {
  if (!ORDER[L]) { console.error(`Unknown level ${L}`); process.exit(1); }
  buildLevel(L);
}
