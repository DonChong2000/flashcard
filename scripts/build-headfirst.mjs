#!/usr/bin/env node
// Build data/Head-First.json from data-src/head-first/{NN}.json (chapter review cards for 深入淺出日語).
//
//   node scripts/build-headfirst.mjs
//
// topic = chapter, question_number = chapter*100 + card index (1-based, so appending cards keeps numbers).
// Options are re-lettered with a seeded shuffle: the correct letter is balanced A–D within each block of
// 4 cards of a chapter. Cards whose options are all numbers, or whose text refers to option letters or
// "all of the above", keep their original lettering.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "data-src", "head-first");
const OUT_FILE = path.join(ROOT, "data", "Head-First.json");
const LETTERS = ["A", "B", "C", "D"];
// Every tag becomes a chip on the home page, and labour tags are mostly one-offs (500 distinct over
// 816 cards). Keep a card's own tag only when at least this many cards share it; the part label stays.
const MIN_TAG_CARDS = 5;

// Numbered chapters of the book (head-first-japanese/book.js CHAPTERS) with their part's JLPT level.
const CHAPTERS = [
  [1, "平假名：日語的五十音", "N5"],
  [2, "片假名與外來語", "N5"],
  [3, "「A は B です」：第一句日語", "N5"],
  [4, "漢字：中文母語者的主場與陷阱", "N5"],
  [5, "助詞 を、に、で、へ、と", "N5"],
  [6, "動詞ます形：現在、過去、否定", "N5"],
  [7, "い形容詞與な形容詞", "N5"],
  [8, "數字、助數詞、時間與價錢", "N5"],
  [9, "て形：請求、進行與連接", "N5"],
  [10, "あります、います與位置", "N5"],
  [11, "普通形與日常口語", "N4"],
  [12, "可能形：會做、能做", "N4"],
  [13, "授受動詞 あげる、くれる、もらう", "N4"],
  [14, "條件句 と、ば、たら、なら", "N4"],
  [15, "意向形、打算與建議", "N4"],
  [16, "動詞小幫手：てみる、ておく、てしまう、ながら", "N4"],
  [17, "被動與使役", "N4"],
  [18, "敬語入門", "N4"],
  [19, "名詞修飾：日語的「的」字句", "N3"],
  [20, "推測：ようだ、そうだ、らしい、みたい", "N3"],
  [21, "はず、わけ、べき", "N3"],
  [22, "尊敬語與謙讓語", "N3"],
  [23, "N3 閱讀：短文與告示", "N3"],
  [24, "N3 聽解：日常會話", "N3"],
  [25, "N2 文法：書面句型", "N2"],
  [26, "である體與新聞日語", "N2"],
  [27, "擬聲語與擬態語", "N2"],
  [28, "職場日語：電郵、會議、電話", "N2"],
  [29, "長文閱讀與速讀", "N2"],
  [30, "N1 文法：文言殘留句型", "N1"],
  [31, "N1 詞彙：四字熟語與難讀漢字", "N1"],
  [32, "讀懂社論與評論", "N1"],
  [33, "聽懂正常語速", "N1"],
  [34, "N1 完整模擬考試", "N1"],
];

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

const NUMERIC = /^[\d０-９\s.,，．%％:：+\-−~～\/]+$/;
const LETTER_REF = /[A-D]\s*(?:選項|項)|選項\s*[A-D]|答案\s*(?:是|為|：|:)?\s*[A-D](?![A-Za-z])|[（(]\s*[A-D]\s*[)）]|(?:^|[^A-Za-z])[A-D]\s*(?:和|與|及|或)\s*[A-D](?![A-Za-z])|以上(?:皆|都|全|選項|三者|各項)|兩者(?:皆|都)|all of the above|none of the above/i;

function fail(msg) { console.error(`build-headfirst: ${msg}`); process.exit(1); }

const tagUses = new Map();
for (const [ch] of CHAPTERS) {
  const file = path.join(SRC_DIR, `${String(ch).padStart(2, "0")}.json`);
  if (!fs.existsSync(file)) continue;
  for (const c of JSON.parse(fs.readFileSync(file, "utf8")))
    for (const t of new Set((c.tags ?? []).map((t) => String(t).trim()))) tagUses.set(t, (tagUses.get(t) ?? 0) + 1);
}

const questions = [];
const stats = { cards: 0, kept: 0, letters: { A: 0, B: 0, C: 0, D: 0 }, chapters: [] };
for (const [ch, , part] of CHAPTERS) {
  const NN = String(ch).padStart(2, "0");
  const file = path.join(SRC_DIR, `${NN}.json`);
  if (!fs.existsSync(file)) continue;
  const cards = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(cards) || cards.length === 0) fail(`${NN}.json: expected a non-empty array`);
  if (cards.length > 99) fail(`${NN}.json: ${cards.length} cards; at most 99 fit chapter*100+index`);
  stats.chapters.push(NN);
  cards.forEach((c, i) => {
    const where = `${NN}.json card ${i + 1}`;
    const keys = Object.keys(c.options ?? {});
    if (keys.join() !== "A,B,C,D") fail(`${where}: options must be A,B,C,D`);
    if (!Array.isArray(c.correct_answer) || c.correct_answer.length !== 1 || !keys.includes(c.correct_answer[0])) fail(`${where}: bad correct_answer`);
    if (!c.question?.trim() || !c.explanation?.trim()) fail(`${where}: empty question or explanation`);

    const texts = keys.map((k) => c.options[k].trim().replace(/\s*[\r\n]+\s*/g, " "));
    const correctIdx = keys.indexOf(c.correct_answer[0]);
    const allText = [c.question, ...texts, c.explanation].join("\n");
    const keep = texts.every((t) => NUMERIC.test(t)) || LETTER_REF.test(allText);

    let order = [0, 1, 2, 3]; // order[newSlot] = original index
    if (!keep) {
      const block = Math.floor(i / 4);
      const target = shuffle([0, 1, 2, 3], rng(`hf-letter:${ch}:${block}`))[i % 4];
      const others = shuffle([0, 1, 2, 3].filter((k) => k !== correctIdx), rng(`hf-options:${ch}:${i + 1}`));
      order = [];
      for (let s = 0, d = 0; s < 4; s++) order.push(s === target ? correctIdx : others[d++]);
    } else stats.kept++;

    const options = Object.fromEntries(order.map((orig, s) => [LETTERS[s], texts[orig]]));
    const answer = LETTERS[order.indexOf(correctIdx)];
    stats.letters[answer]++;
    stats.cards++;
    const own = (c.tags ?? []).map((t) => String(t).trim()).filter((t) => t && tagUses.get(t) >= MIN_TAG_CARDS);
    const tags = [...new Set([part, ...own])];
    questions.push({
      question_number: ch * 100 + i + 1,
      topic: ch,
      question: c.question.trim(),
      options,
      correct_answer: [answer],
      tags,
      discussion: [{ username: "解釋", upvotes: 0, comment: c.explanation.trim(), selected: [answer] }],
    });
  });
}

if (questions.length === 0) { console.log("No data-src/head-first/*.json found; nothing to build."); process.exit(0); }

const topic_names = Object.fromEntries(CHAPTERS.map(([ch, title]) => [String(ch), `${String(ch).padStart(2, "0")} ${title}`]));
const out = { name: "深入淺出日語", order: 10, total_questions: questions.length, topic_names, questions };
fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}: ${stats.cards} cards from ${stats.chapters.length} chapters (${stats.chapters.join(" ")}); ` +
  `answers ${Object.entries(stats.letters).map(([k, v]) => k + v).join(" ")}; ${stats.kept} kept original lettering; ` +
  `${new Set(questions.flatMap((q) => q.tags)).size} distinct tags`);
