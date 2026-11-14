import { toHiragana } from "wanakana";

// Romaji, katakana or hiragana → hiragana, spaces stripped. A trailing "n" becomes ん.
export function normalizeReading(input: string): string {
  return toHiragana(input.replace(/[\s　]+/g, "").toLowerCase());
}

// Live conversion while typing: leaves a trailing "n" alone until the next letter decides it.
export function liveKana(input: string): string {
  return toHiragana(input, { IMEMode: true });
}

// A reading field may list alternatives ("あした・あす") and notes in brackets: "よって（よりどころ）"
// (a gloss), "コンタクト（レンズ）" (an optional part), "さぞ（さぞや、さぞかし）" (variants).
// Accept the bare form, the form with the bracket inlined, and each bracketed variant.
const PAREN = /[（(]([^）)]*)[）)]/g;
export function readingAlternatives(reading: string): string[] {
  const out: string[] = [];
  for (const part of reading.replace(/[～~]/g, "").split(/[,，;；/／・](?![^（(]*[）)])/)) {
    out.push(part.replace(PAREN, ""), part.replace(PAREN, "$1"));
    for (const m of part.matchAll(PAREN)) out.push(...m[1].split(/[、,，・]/));
  }
  return [...new Set(out.map(normalizeReading).filter(Boolean))];
}

// The reading to show in the diff and to speak: the first alternative, notes removed.
export function primaryReading(reading: string): string {
  return readingAlternatives(reading)[0] ?? "";
}

export function readingMatches(typed: string, reading: string): boolean {
  const t = normalizeReading(typed);
  return readingAlternatives(reading).includes(t);
}

const SMALL = new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ");

// Split kana into mora: small ゃ/ゅ/ょ/ぁ… attach to the previous kana; っ, ん and ー stand alone.
export function toMora(kana: string): string[] {
  const out: string[] = [];
  for (const ch of kana) {
    if (SMALL.has(ch) && out.length > 0) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

export interface MoraPart {
  text: string;
  ok: boolean;
}

// LCS alignment of two mora sequences; each side marks the mora not shared with the other.
export function moraDiff(typed: string, correct: string): { typed: MoraPart[]; correct: MoraPart[] } {
  const a = toMora(typed);
  const b = toMora(correct);
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ta: MoraPart[] = [];
  const tb: MoraPart[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { ta.push({ text: a[i++], ok: true }); tb.push({ text: b[j++], ok: true }); }
    else if (L[i + 1][j] >= L[i][j + 1]) ta.push({ text: a[i++], ok: false });
    else tb.push({ text: b[j++], ok: false });
  }
  while (i < a.length) ta.push({ text: a[i++], ok: false });
  while (j < b.length) tb.push({ text: b[j++], ok: false });
  return { typed: ta, correct: tb };
}
