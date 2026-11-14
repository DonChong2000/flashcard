# 日語 Flashcards

A static flashcard app for learning Japanese: kana, Head First Japanese lesson cards, JLPT N5–N1 vocabulary, and JLPT past-paper questions (with listening audio). Tracks your progress per card, supports bookmarks, cross-device sync, and works offline as a PWA.

Live at: https://donchong2000.github.io/japanese-flashcard

## Decks

| File | Name | Source |
| --- | --- | --- |
| `data/Kana.json` | 假名 | hand-made |
| `data/Head-First.json` | 深入淺出日語 | built by `scripts/build-headfirst.mjs` from `data-src/head-first/`, derived from [head-first-japanese](https://github.com/DonChong2000/head-first-japanese) |
| `data/Vocab-N5.json` … `Vocab-N1.json` | N5 詞彙 … N1 詞彙 | built by `scripts/build-vocab.mjs` from `data-src/vocab/`, from [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) (MIT), based on the [tanos.co.uk](https://www.tanos.co.uk/jlpt/) JLPT lists |
| `data/JLPT-N5.json` … `JLPT-N1.json` | JLPT N5 … N1 歷屆試題 | JLPT past papers; listening audio/images under `public/media/jlpt_n*/` |

## Features

- Practice by set or all cards at once, plus a random 20-card mix
- Filter to review only incorrect, unseen or bookmarked cards
- Progress tracked in localStorage — persists across sessions
- Export/import progress as JSON, plus cross-device sync via a small Cloudflare Worker
- Daily activity heatmap and streak
- Keyboard shortcuts: `1–6` select options, `Enter`/`Space` submit or advance, `→` advance after reveal, `B` bookmark
- Installable PWA, works offline after first visit

## Development

```bash
pnpm install
pnpm dev      # processes data, then starts dev server at localhost:3000/japanese-flashcard
pnpm test     # validates data/*.json
```

## Adding a deck

1. Place a `.json` file in `data/` following this schema:

```json
{
  "name": "N5 詞彙",
  "order": 21,
  "topic_names": { "1": "..." },
  "questions": [{
    "question_number": 1,
    "topic": 1,
    "question": "...",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "correct_answer": ["A"],
    "community_votes": {},
    "discussion": []
  }]
}
```

`name` (display name), `order` (sort key, missing = 999) and `topic_names` (set labels) are optional. Questions may also carry `image` / `audio` paths under `public/`.

2. Run `pnpm dev` or `pnpm build` — the data processor generates `public/data/` automatically.

The slug is derived from the filename (`JLPT-N5.json` → `jlpt_n5`) and keys the saved progress, so don't rename existing files.

## Build & deploy

```bash
pnpm build    # outputs static site to out/
```

Pushing to `main` deploys `out/` to GitHub Pages via `.github/workflows/deploy.yml`. The app is a fully static Next.js export with `basePath: "/japanese-flashcard"`. No server required.

This app shares the `donchong2000.github.io` origin, localStorage keys and sync Worker with the older `/flashcard` app, so existing Kana/JLPT progress carries over.
