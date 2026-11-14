#!/usr/bin/env node
// Build data/Vocab-N{L}.json from data-src/vocab/n{L}.json. Each card carries a `vocab` object
// (data-src/vocab/CONTRACT.md) and is a multiple-choice question of one of two kinds:
// - "reading" (all-kanji word): pick the reading among the correct one and three near misses made by
//   rule, as in JLPT 問題1 (long/short vowel, dakuten, っ, ん, a confusable on'yomi);
// - "meaning" (word with kana): pick the zh gloss; distractors of the same part of speech, preferably
//   from a close semantic field, never overlapping the correct gloss.
// The example sentence (`ex`, N2/N1) is shown with the word marked 【 】 when present.
//
//   node scripts/build-vocab.mjs [5 4 ...]     (default: every level whose source exists)
//
// Everything random is seeded from stable ids, so the output only changes when the source does:
// - topic (set of ≤100 words): a seeded shuffle of the level, split into equal sets
// - correct letter: balanced A–D within each block of 4 consecutive ids
// - rank: frequency in the JLPT past papers of the same and adjacent levels (data/JLPT-N*.json)

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

// ---------- word forms, kind, sentence matching ----------
const HAN = /\p{Script=Han}|々/u;
const ALL_HAN = /^[\p{Script=Han}々]+$/u;
const HIRA = /\p{Script=Hiragana}/u;
const KANA = /[ぁ-ゟ゠-ヿ]/;
// Alternatives of the display word without ～ and with optional parts both kept and dropped.
function wordForms(main) {
  const out = [];
  for (const alt of main.split(/[／,，]/)) {
    const a = alt.replace(/～/g, "");
    for (const f of [a.replace(/[（）]/g, ""), a.replace(/（[^）]*）/g, "")]) if (f && !out.includes(f)) out.push(f);
  }
  return out;
}
const isAllKanji = (main) => { const alts = main.split("／").map((a) => a.replace(/[～（）]/g, "")); return alts.every((a) => a && ALL_HAN.test(a)); };
const inflects = (f) => /\p{Script=Hiragana}$/u.test(f) && f.length >= 2;
// Search keys for an inflecting form: the form minus its trailing hiragana when it has kanji, else
// minus its last character (kana words of 3+ characters); する verbs: the noun.
function stemOf(f) {
  if (/する$/.test(f) && f.length > 3) return f.slice(0, -2);
  const m = /^(.*[\p{Script=Han}々\p{Script=Katakana}ー])\p{Script=Hiragana}+$/u.exec(f);
  if (m) return m[1];
  if (f.length >= 3) return f.slice(0, -1);
  return f;
}
// Regex tolerating kana spellings of some kanji and extra okurigana: 差し掛かる ~ 差しかかる, 引下げる ~ 引き下げる.
function looseRe(f) {
  const s = inflects(f) ? stemOf(f) : f;
  if (!HAN.test(s)) return null;
  let src = "";
  const chars = [...s];
  chars.forEach((c, i) => {
    if (i === 0 && c === "御") src += "(?:御|お|ご)";
    else if (HAN.test(c)) src += `(?:${c}|[ぁ-ゖ]{1,3})`;
    else src += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (HAN.test(c) && i + 1 < chars.length && HAN.test(chars[i + 1])) src += "[ぁ-ゖ]?";
  });
  return new RegExp(src, "uy");
}
// First match that keeps at least one kanji (a sticky regex tried at every position).
function looseFind(re, text) {
  for (let i = 0; i < text.length; i++) { re.lastIndex = i; const m = re.exec(text); if (m && HAN.test(m[0])) return m; }
  return null;
}
const STOP_AFTER = new Set([..."るたいうくすつぬぶむぐだてでんずし"]);
const PARTICLE = new Set([..."をはへものよねがにとやか"]);
// full: the dictionary form itself was matched, so a particle may follow at once (見通し|が)
function extendInflection(ja, end, full = false) {
  const first = full ? end - 1 : end;
  let j = end;
  while (j < ja.length && HIRA.test(ja[j])) {
    if (j > first && PARTICLE.has(ja[j]) && STOP_AFTER.has(ja[j - 1]) && !(ja[j] === "か" && /[っら]/.test(ja[j + 1] ?? ""))) break;
    // stop after the te-form (【立ち去って】しまった) and before こと (【害する】ことになる)
    if (j > end && /[てで]/.test(ja[j - 1])) break;
    if (j > first && ja.startsWith("こと", j)) break;
    j++;
  }
  return j;
}
// Locate the word in its example sentence; returns [start, end) or null.
function findWord(ja, main, reading, pos) {
  const conj = pos === "verb" || pos === "adj";
  const tries = [];
  for (const f of wordForms(main)) tries.push({ key: f, infl: conj && inflects(f), full: true });
  // stem match: inflected verbs/adjectives, and words the source mis-tags (おっかなくて, ありふれた)
  for (const f of wordForms(main)) if (inflects(f) && [...stemOf(f)].length >= (HAN.test(f) ? 1 : 2)) tries.push({ key: stemOf(f), infl: true });
  for (const t of tries) {
    const i = ja.indexOf(t.key);
    if (i >= 0) return [i, t.infl ? extendInflection(ja, i + t.key.length, !!t.full) : i + t.key.length];
  }
  for (const f of wordForms(main)) {
    const re = looseRe(f);
    const m = re && looseFind(re, ja);
    if (m) return [m.index, conj && inflects(f) ? extendInflection(ja, m.index + m[0].length) : m.index + m[0].length];
  }
  // written in kana, or in the other kana script (びら / ビラ)
  const hira = (t) => t.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const jaH = hira(ja);
  for (const f of [...(reading ? wordForms(reading) : []), ...wordForms(main).filter((f) => !HAN.test(f))]) {
    const key = hira(conj && inflects(f) ? stemOf(f) : f);
    const i = key.length >= 2 ? jaH.indexOf(key) : -1;
    if (i >= 0) return [i, conj && inflects(f) ? extendInflection(ja, i + key.length) : i + key.length];
  }
  return null;
}
function markWord(ja, main, reading, pos) {
  const r = findWord(ja, main, reading, pos);
  return r ? ja.slice(0, r[0]) + "【" + ja.slice(r[0], r[1]) + "】" + ja.slice(r[1]) : null;
}

// ---------- near-miss readings (JLPT 問題1 style) ----------
const SMALL = new Set([..."ゃゅょぁぃぅぇぉゎ"]);
const O_ROW = new Set([..."おこそとのほもよろごぞどぼぽょ"]);
const U_ROW = new Set([..."くすつぬふむゆるぐずぶぷゅ"]);
const E_ROW = new Set([..."けせてねへめれげぜでべぺ"]);
const VOICE = { か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご", さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ", た: "だ", て: "で", と: "ど", は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ" };
const DAKU = new Map();
for (const [a, b] of Object.entries(VOICE)) { DAKU.set(a, [b]); DAKU.set(b, [a]); }
for (const [h, b, p] of [["は", "ば", "ぱ"], ["ひ", "び", "ぴ"], ["ふ", "ぶ", "ぷ"], ["へ", "べ", "ぺ"], ["ほ", "ぼ", "ぽ"]]) {
  DAKU.set(h, [b, p]); DAKU.set(b, [h, p]); DAKU.set(p, [h, b]);
}
const KSTP = /^[かきくけこさしすせそたちつてとぱぴぷぺぽ]/; // may follow っ
// Confusable on'yomi (both directions): one kanji's common readings, or classic JLPT mix-ups.
const ONYOMI = [["せい", "しょう"], ["じん", "にん"], ["だい", "たい"], ["げ", "か"], ["げ", "がい"], ["げん", "がん"], ["こう", "ぎょう"],
  ["じゅう", "ちょう"], ["じき", "しょく"], ["みょう", "めい"], ["ぶつ", "もつ"], ["もん", "ぶん"], ["にち", "じつ"], ["じょう", "せい"],
  ["きょう", "けい"], ["ご", "こう"], ["ぜん", "ねん"], ["ぶん", "ふん"], ["じ", "ち"], ["せき", "しゃく"], ["かい", "え"], ["ぶ", "む"],
  ["き", "け"], ["てい", "たい"], ["きん", "こん"], ["わ", "お"], ["く", "こう"], ["りょく", "りき"], ["りゅう", "る"], ["えき", "やく"],
  ["しき", "しょく"], ["さい", "せつ"], ["ぼ", "も"], ["じゃく", "にゃく"], ["しゅ", "す"], ["ほう", "はっ"], ["そう", "さっ"]];
const ONYOMI_MAP = new Map();
for (const [a, b] of ONYOMI) { (ONYOMI_MAP.get(a) ?? ONYOMI_MAP.set(a, []).get(a)).push(b); (ONYOMI_MAP.get(b) ?? ONYOMI_MAP.set(b, []).get(b)).push(a); }

// Is position i the start of a mora (not a small kana / long-vowel continuation)?
const moraStart = (r, i) => i < r.length && !SMALL.has(r[i]) && r[i] !== "ー";
const moraEndOk = (r, j) => j >= r.length || !SMALL.has(r[j]);
function validReading(r) {
  if (!r || SMALL.has(r[0]) || /^[んっー]/.test(r) || /っ$/.test(r)) return false;
  if (/っっ|んん|っん|っ[あいうえおなにぬねのまみむめもやゆよらりるれろわをんゃゅょ]|[ゃゅょ][ゃゅょ]|ぢ|づ/.test(r)) return false;
  for (let i = 1; i < r.length; i++) if (SMALL.has(r[i]) && !/[きしちにひみりぎじびぴ]/.test(r[i - 1])) return false;
  for (let i = 0; i < r.length; i++) if (r[i] === "っ" && !KSTP.test(r.slice(i + 1))) return false;
  return true;
}
// Split a reading into one unit per kanji: on'yomi-shaped units (one mora plus an optional
// い/う/ん/き/く/ち/つ/っ) first, then longer kun units. Returns [[start, end], ...] in characters, or null.
const TAIL = new Set([..."いうんきくちつっ"]);
function morae(r) {
  const m = [];
  for (const c of r) { if (m.length && (SMALL.has(c) || c === "ー")) m[m.length - 1] += c; else m.push(c); }
  return m;
}
function segment(r, n) {
  const m = morae(r);
  if (n < 1 || m.length < n) return null;
  const go = (k, left, maxLen, strict) => {
    if (left === 0) return k === m.length ? [] : null;
    for (let len = 1; len <= maxLen && k + len <= m.length; len++) {
      if (strict && len === 2 && !TAIL.has(m[k + 1])) continue;
      if (left === 1 && k + len !== m.length) continue;
      const rest = go(k + len, left - 1, maxLen, strict);
      if (rest) return [[k, k + len], ...rest];
    }
    return null;
  };
  const units = go(0, n, 2, true) ?? go(0, n, 4, false);
  if (!units) return null;
  const off = [0];
  for (const x of m) off.push(off.at(-1) + x.length);
  return units.map(([a, b]) => [off[a], off[b]]);
}
// Candidate single edits {i, j, rep, type} on reading r (replace r.slice(i, j) by rep). With a
// segmentation every edit stays inside one kanji's unit (or at a unit boundary), as JLPT near misses do.
function readingEdits(r, seg) {
  const E = [];
  const starts = seg ? new Set(seg.map((u) => u[0])) : null;
  const ends = seg ? new Set(seg.map((u) => u[1])) : null;
  const unitOf = (i) => seg?.find(([a, b]) => i >= a && i < b);
  for (let i = 0; i < r.length; i++) {
    const c = r[i], next = r[i + 1] ?? "";
    const u = unitOf(i);
    const lastOfUnit = !seg || (u && i === u[1] - 1);
    const singleMora = u && morae(r.slice(u[0], u[1])).length === 1;
    // long vowel
    if (i > 0 && lastOfUnit && !starts?.has(i) && ((c === "う" && (O_ROW.has(r[i - 1]) || U_ROW.has(r[i - 1]))) || (c === "い" && E_ROW.has(r[i - 1])))) E.push({ i, j: i + 1, rep: "", type: "long" });
    const insOk = !seg ? i === r.length - 1 : ends.has(i + 1) && singleMora;
    if (insOk && (O_ROW.has(c) || /[ゅゆ]/.test(c)) && next !== "う") E.push({ i: i + 1, j: i + 1, rep: "う", type: "long" });
    if (insOk && E_ROW.has(c) && next !== "い" && i > 0) E.push({ i: i + 1, j: i + 1, rep: "い", type: "long" });
    // dakuten / handakuten (on the first sound of a kanji's unit)
    if (!seg || starts.has(i)) for (const d of DAKU.get(c) ?? []) E.push({ i, j: i + 1, rep: d, type: "daku" });
    // 促音
    if (c === "っ") { E.push({ i, j: i + 1, rep: /^[かきくけこ]/.test(next) ? "く" : "つ", type: "sokuon" }); E.push({ i, j: i + 1, rep: "", type: "sokuon" }); }
    if (i > 0 && lastOfUnit && !starts?.has(i) && /[くつちき]/.test(c) && KSTP.test(next) && r[i - 1] !== "っ") E.push({ i, j: i + 1, rep: "っ", type: "sokuon" });
    const boundary = !seg ? moraStart(r, i) : i > 0 && starts.has(i) && morae(r.slice(...unitOf(i - 1))).length === 1;
    if (i > 0 && boundary && KSTP.test(r.slice(i)) && !/[っんーうい]/.test(r[i - 1])) E.push({ i, j: i, rep: "っ", type: "sokuon" });
    // 撥音
    if (c === "ん" && i > 0 && lastOfUnit) E.push({ i, j: i + 1, rep: "", type: "hatsuon" });
    if (seg && i > 0 && boundary && !/[あいうえおやゆよわんっ]/.test(c) && !/[んっうい]/.test(r[i - 1])) E.push({ i, j: i, rep: "ん", type: "hatsuon" });
    // unit-final く↔き, つ↔ち (力 りょく/りき, 一 いつ/いち); ち→じ, つ→ず on a unit's first sound
    if (seg && i > 0 && lastOfUnit && !starts.has(i)) {
      const swap = { く: "き", き: "く", つ: "ち", ち: "つ" }[c];
      if (swap) E.push({ i, j: i + 1, rep: swap, type: "final" });
    }
    if (seg && starts.has(i) && (c === "ち" || c === "つ")) E.push({ i, j: i + 1, rep: c === "ち" ? "じ" : "ず", type: "daku" });
    // confusable on'yomi: a whole unit only, so never without a segmentation
    if (seg && starts.has(i)) for (const [from, tos] of ONYOMI_MAP) {
      if (r.startsWith(from, i) && ends.has(i + from.length)) for (const to of tos) E.push({ i, j: i + from.length, rep: to, type: "onyomi" });
    }
  }
  if (seg) for (const e of E) e.u = seg.findIndex(([a, b]) => (e.i < e.j ? e.i >= a && e.i < b : e.i > a && e.i <= b));
  return E;
}
const applyEdits = (r, edits) => [...edits].sort((a, b) => b.i - a.i).reduce((s, e) => s.slice(0, e.i) + e.rep + s.slice(e.j), r);
const disjoint = (a, b) => a.j < b.i || b.j < a.i || (a.i === a.j && b.i === b.j ? a.i !== b.i : (a.j <= b.i && a.i < b.i) || (b.j <= a.i && b.i < a.i));
const TYPE_PREF = { onyomi: 0, long: 1, daku: 2, sokuon: 3, final: 3, hatsuon: 4 };
// Three near misses: preferably a 2×2 grid {e1, e2, e1+e2} so the correct reading is not the odd one out.
// suffix: a counter/suffix (～匹) whose first sound changes by rendaku (さんびき), so voicing it is no error
function nearMisses(r, nKanji, forbidden, rand, suffix = false) {
  const seg = segment(r, nKanji);
  const keep = (E) => (suffix ? E.filter((e) => !(e.type === "daku" && e.i === 0)) : E);
  const order = (E) => E.map((e) => ({ e, k: TYPE_PREF[e.type] + rand() * 3 })).sort((a, b) => a.k - b.k).map((x) => x.e);
  const ok = (s) => s !== r && validReading(s) && !forbidden.has(s);
  const grid = (edits) => {
    for (let x = 0; x < edits.length; x++) {
      for (let y = x + 1; y < edits.length; y++) {
        const a = edits[x], b = edits[y];
        if (a.type === b.type && a.type !== "onyomi" && a.type !== "daku") continue;
        if (!disjoint(a, b)) continue;
        // an on'yomi swap replaces its whole unit: nothing else may touch that unit
        if (a.u !== undefined && a.u === b.u && (a.type === "onyomi" || b.type === "onyomi")) continue;
        const s1 = applyEdits(r, [a]), s2 = applyEdits(r, [b]), s3 = applyEdits(r, [a, b]);
        if ([s1, s2, s3].every(ok) && new Set([s1, s2, s3]).size === 3) return [s1, s2, s3];
      }
    }
    return null;
  };
  const segEdits = order(keep(readingEdits(r, seg)));
  // without a segmentation (or when it allows too little) fall back to position-free rules, no on'yomi swaps
  const freeEdits = seg ? order(keep(readingEdits(r, null))) : segEdits;
  const g = grid(segEdits) ?? (seg ? grid(freeEdits) : null);
  if (g) return { list: g, how: "grid" };
  const singles = [];
  for (const e of [...segEdits, ...freeEdits]) { const s = applyEdits(r, [e]); if (ok(s) && !singles.includes(s)) singles.push(s); if (singles.length === 3) break; }
  return { list: singles, how: singles.length === 3 ? "rule" : "fallback" };
}

// ---------- past-paper frequency ----------
const PAPER_LEVELS = { 5: [5, 4], 4: [5, 4, 3], 3: [4, 3, 2], 2: [3, 2, 1], 1: [1, 2] };
const paperText = new Map();
function papers(L) {
  const key = PAPER_LEVELS[L].join();
  if (!paperText.has(key)) {
    const parts = [];
    for (const l of PAPER_LEVELS[L]) {
      const f = path.join(OUT_DIR, `JLPT-N${l}.json`);
      if (!fs.existsSync(f)) continue;
      for (const q of JSON.parse(fs.readFileSync(f, "utf8")).questions) parts.push(q.question, ...Object.values(q.options ?? {}));
    }
    paperText.set(key, parts.join("\n"));
  }
  return paperText.get(key);
}
// Occurrences of `key`; `after` (regex) must match the next character when given. A one-kanji key
// counts only standing alone (日 not in 毎日), and a short kana word must not be the tail of a longer
// kana word (ずれ in いずれ): only a particle may precede it.
function countIn(text, key, after) {
  if (!key) return 0;
  const kanaKey = !HAN.test(key) && [...key].length <= 3;
  const oneKanji = [...key].length === 1 && HAN.test(key);
  let n = 0;
  for (let i = text.indexOf(key); i >= 0; i = text.indexOf(key, i + key.length)) {
    const prev = text[i - 1] ?? "", next = text[i + key.length] ?? "";
    if (after && !after.test(next)) continue;
    if (oneKanji && (HAN.test(prev) || HAN.test(next))) continue;
    if (kanaKey && KANA.test(prev) && !/[のがをにはともでへや]/.test(prev)) continue;
    n++;
  }
  return n;
}
function frequency(text, main) {
  const keys = new Map();
  for (const f of wordForms(main)) {
    if (inflects(f) && HAN.test(f)) {
      // inflecting word: the form minus its last kana (生か for 生かす, 美し for 美しい); する verbs: noun + し/さ/す/せ
      if (/する$/.test(f) && f.length > 2) keys.set(f.slice(0, -2), /^[しさすせ]/);
      else keys.set(f.slice(0, -1), null);
    } else keys.set(f, null);
  }
  // affixes count only attached to a word: ～日 after a kanji or digit, 最～ before a kanji
  const suffix = /^～/.test(main), prefix = /～$/.test(main) && !suffix;
  let n = 0;
  for (const [k, after] of keys) {
    if (suffix || prefix) {
      for (let i = text.indexOf(k); i >= 0; i = text.indexOf(k, i + k.length)) {
        if (suffix ? /[\p{Script=Han}々0-9０-９〇一二三四五六七八九十百千]/u.test(text[i - 1] ?? "") : HAN.test(text[i + k.length] ?? "")) n++;
      }
    } else n += countIn(text, k, after);
  }
  // an affix is mostly met inside longer words, which are cards of their own: rank it lower
  return suffix || prefix ? Math.floor(n / 4) : n;
}

// ---------- build one level ----------
const KIND_TAG = { reading: "讀音", meaning: "詞義" };
function buildLevel(L) {
  const srcFile = path.join(SRC_DIR, `n${L}.json`);
  const source = JSON.parse(fs.readFileSync(srcFile, "utf8"));
  const problems = [];

  let words = source.map((x) => {
    const ja = cleanJa(x.expression);
    const rd = cleanJa(x.reading);
    const zh = String(x.zh).replace(/[\r\n]+/g, "；").trim();
    const kind = isAllKanji(ja.main) ? "reading" : "meaning";
    const same = kind === "reading" && x.same === true;
    return {
      id: x.id, ja, en: x.en.trim(), zh, rd: rd.main,
      reading: rd.main && rd.main !== ja.main ? rd.main : "",
      pos: partOfSpeech(ja, x.en, VERB_STEMS), senses: senses(zh), han: hanSet(zh),
      kind, same, trap: kind === "reading" && !same, ex: x.ex && x.ex.ja && x.ex.zh ? { ja: x.ex.ja, zh: x.ex.zh } : null,
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
    w.explainHead = (w.reading ? `${w.ja.main}（${w.reading}）` : w.ja.main) + w.ja.note;
    // The reading as a quiz answer: first alternative, optional parts such as （する） dropped.
    w.answerReading = (w.reading.split("／")[0] ?? "").replace(/（[^）]*）/g, "").trim();
    w.marked = w.ex ? markWord(w.ex.ja, w.ja.main, w.rd, w.pos) : null;
    if (w.ex && !w.marked) problems.push(`id ${w.id} ${w.ja.main}: word not found in example ${w.ex.ja}`);
  }

  // Topics: seeded order, cut into equal sets of at most SET_SIZE (unchanged, progress keys depend on it).
  const order = [...words].sort((a, b) => hash32(`vocab-topic:n${L}:${a.id}`) - hash32(`vocab-topic:n${L}:${b.id}`) || a.id - b.id);
  const nSets = Math.ceil(order.length / SET_SIZE);
  order.forEach((w, i) => { w.topic = Math.floor((i * nSets) / order.length) + 1; });

  // Study rank: past-paper frequency, then trap/kana words before same words, then id.
  const text = papers(L);
  for (const w of words) w.freq = frequency(text, w.ja.main);
  [...words].sort((a, b) => b.freq - a.freq || (a.same ? 1 : 0) - (b.same ? 1 : 0) || a.id - b.id).forEach((w, i) => { w.rank = i + 1; });

  // Readings that must never be offered as wrong answers: every reading of the same headword, any level.
  const forbidFor = (w) => {
    const s = new Set();
    for (const f of [w.ja.main, ...wordForms(w.ja.main)]) for (const r of ALL_READINGS.get(f) ?? []) s.add(r);
    return s;
  };
  const readingPool = words.filter((w) => w.kind === "reading" && w.answerReading);

  const byPos = new Map();
  for (const w of words) (byPos.get(w.pos) ?? byPos.set(w.pos, []).get(w.pos)).push(w);
  const len = (w) => [...w.zh].length;
  const similarLength = (a, b) => Math.abs(len(a) - len(b)) <= 2 || (len(b) / len(a) >= 0.6 && len(b) / len(a) <= 1.67);
  const sameHead = (a, b) => a.ja.main === b.ja.main;
  // Close field: a shared meaningful character in the gloss, but no shared English content word
  // (that would usually be a synonym that also fits the example sentence).
  const close = (a, b) => [...a.han].some((c) => b.han.has(c) && !GENERIC_HAN.has(c)) && !a.enWords.some((x) => b.enWords.includes(x));
  for (const w of words) w.enWords = [...new Set(w.en.toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z']+/).filter((x) => x.length >= 4 && !EN_STOP.has(x)))];

  const stats = { reading: 0, meaning: 0, same: 0, trap: 0, grid: 0, rule: 0, fallback: 0, readingAsMeaning: 0, withEx: 0, close: 0 };
  const questions = [];
  for (const w of order) {
    stats[w.kind]++; if (w.same) stats.same++; if (w.trap) stats.trap++; if (w.ex) stats.withEx++;
    const block = Math.floor((w.id - 1) / 4);
    const pos = shuffle([0, 1, 2, 3], rng(`vocab-letter:n${L}:${block}`))[(w.id - 1) % 4];
    const answer = LETTERS[pos];
    let question, values;
    const head = w.disambiguate && w.reading ? `${w.ja.main}（${w.reading}）` : w.ja.main;

    if (w.kind === "reading" && w.answerReading) {
      // affix markers stay outside the edited core: ～しゃ -> ～じゃ
      const m = /^(～?)(.*?)(～?)$/.exec(w.answerReading);
      const [pre, core, post] = [m[1], m[2], m[3]];
      const forbidden = new Set([...forbidFor(w)].map((r) => r.replace(/（[^）]*）/g, "").replace(/～/g, "")));
      const rand = rng(`vocab-reading:n${L}:${w.id}`);
      const nKanji = [...w.ja.main.split("／")[0].replace(/～|（[^）]*）/g, "")].length;
      let { list, how } = nearMisses(core, nKanji, forbidden, rand, pre === "～");
      if (list.length < 3) {
        const n = [...core].length;
        const pool = shuffle(readingPool, rand);
        for (const tol of [0, 1, 2, 9]) {
          for (const c of pool) {
            if (list.length === 3) break;
            const r = c.answerReading.replace(/～/g, "");
            if (Math.abs([...r].length - n) <= tol && r !== core && !forbidden.has(r) && !list.includes(r)) list.push(r);
          }
        }
      }
      stats[how]++;
      const distract = list.map((r) => pre + r + post);
      values = []; let d = 0;
      for (let i = 0; i < 4; i++) values.push(i === pos ? w.answerReading : distract[d++]);
      const lines = [head + (w.ja.note ? `\n${w.ja.note}` : "")];
      if (w.disambiguate && !w.ex) lines.push(`（${w.zh}）`);
      question = w.marked ? `【　】の言葉の読み方として最もよいもの。\n\n${w.marked}` : w.ex ? `${lines.join("\n")}\n\n${w.ex.ja}` : lines.join("\n");
    } else {
      if (w.kind === "reading") stats.readingAsMeaning++;
      const rand = rng(`vocab-distractor:n${L}:${w.id}`);
      const picked = [];
      const ok = (c) => c !== w && !sameHead(c, w) && !overlaps(c, w) && picked.every((p) => p !== c && !overlaps(p, c));
      const samePos = shuffle(byPos.get(w.pos), rand);
      const all = shuffle(words, rand);
      const tiers = [
        samePos.filter((c) => close(w, c) && similarLength(w, c)),
        samePos.filter((c) => close(w, c)),
        samePos.filter((c) => similarLength(w, c)),
        samePos,
        all.filter((c) => similarLength(w, c)),
        all,
      ];
      let nClose = 0;
      tiers.forEach((tier, t) => {
        for (const c of tier) { if (picked.length === 3) break; if (ok(c)) { picked.push(c); if (t < 2) nClose++; } }
      });
      if (picked.length < 3) throw new Error(`n${L} id ${w.id}: could not find 3 distractors`);
      if (nClose) stats.close++;
      values = []; let d = 0;
      for (let i = 0; i < 4; i++) values.push(i === pos ? w.zh : picked[d++].zh);
      const lines = [head + (w.ja.note ? `\n${w.ja.note}` : "")];
      question = w.marked ? `【　】の言葉の意味として最もよいもの。\n\n${w.marked}` : w.ex ? `${lines.join("\n")}\n\n${w.ex.ja}` : lines.join("\n");
    }
    if (new Set(values).size !== 4) throw new Error(`n${L} id ${w.id}: duplicate options ${values.join(" / ")}`);

    const options = Object.fromEntries(values.map((v, i) => [LETTERS[i], v]));
    let comment = `${w.explainHead}\n${w.zh}\n${w.en}`;
    if (w.ex) comment += `\n\n${w.ex.ja}\n${w.ex.zh}`;
    const vocab = { word: w.ja.main + w.ja.note, reading: w.rd, zh: w.zh, en: w.en, kind: w.kind, same: w.same, trap: w.trap, rank: w.rank };
    if (w.ex) vocab.ex = { ja: w.ex.ja, zh: w.ex.zh };
    questions.push({
      question_number: w.id,
      topic: w.topic,
      question,
      options,
      correct_answer: [answer],
      tags: [POS_TAG[w.pos], KIND_TAG[w.answerReading || w.kind !== "reading" ? w.kind : "meaning"]],
      discussion: [{ username: "解釋", upvotes: 0, comment, selected: [answer] }],
      vocab,
    });
  }

  const topic_names = Object.fromEntries(Array.from({ length: nSets }, (_, i) => [String(i + 1), `第 ${i + 1} 組`]));
  const out = { name: `N${L} 詞彙`, order: ORDER[L], study: true, total_questions: questions.length, topic_names, questions };
  const outFile = path.join(OUT_DIR, `Vocab-N${L}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");

  const letterCount = { A: 0, B: 0, C: 0, D: 0 };
  for (const q of questions) letterCount[q.correct_answer[0]]++;
  console.log(`Wrote ${path.relative(ROOT, outFile)}: ${questions.length} cards in ${nSets} sets; ` +
    `answers ${Object.entries(letterCount).map(([k, v]) => k + v).join(" ")}; ` +
    `reading ${stats.reading} (near misses: grid ${stats.grid}, 3 single ${stats.rule}, fallback ${stats.fallback}; ` +
    `no reading → meaning card ${stats.readingAsMeaning}), meaning ${stats.meaning} (close-field distractor ${stats.close}); ` +
    `same ${stats.same}, trap ${stats.trap}, with example ${stats.withEx}`);
  for (const p of problems) console.log(`  note: ${p}`);
}

const GENERIC_HAN = new Set([..."性化不無非一二三大小多少人物事出入上下中內外子心氣來去有好在為成生行用作做到得見看說會能可以使開動手頭面口身體部分方法時日月年天東西前後高低長短新舊"]);
const EN_STOP = new Set(["something", "someone", "somebody", "one's", "oneself", "thing", "things", "with", "from", "into", "that", "this", "very", "make", "have", "being", "about", "used", "other", "such", "kind", "sort", "become", "take", "give", "come", "good", "well", "also", "much", "more", "most", "state", "person", "people", "place", "part", "time", "after", "before", "over", "under", "when", "what", "like"]);

// Every reading of every headword across the levels (for "never offer a valid reading as wrong").
const ALL_READINGS = new Map();
for (const f of fs.existsSync(SRC_DIR) ? fs.readdirSync(SRC_DIR).filter((f) => /^n\d\.json$/.test(f)) : []) {
  for (const x of JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), "utf8"))) {
    const main = cleanJa(x.expression).main;
    const rds = cleanJa(x.reading).main.split("／").map((r) => r.replace(/（[^）]*）/g, "").trim()).filter(Boolean);
    for (const k of [main, ...wordForms(main)]) { const s = ALL_READINGS.get(k) ?? ALL_READINGS.set(k, new Set()).get(k); for (const r of rds) s.add(r); }
  }
}

const requested = process.argv.slice(2).map((a) => Number(String(a).replace(/^n/i, "")));
const levels = requested.length ? requested : [5, 4, 3, 2, 1].filter((L) => fs.existsSync(path.join(SRC_DIR, `n${L}.json`)));
if (levels.length === 0) { console.log("No data-src/vocab/n*.json found; nothing to build."); process.exit(0); }
for (const L of levels) {
  if (!ORDER[L]) { console.error(`Unknown level ${L}`); process.exit(1); }
  buildLevel(L);
}
