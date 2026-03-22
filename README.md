# AWS Cert Flashcards

A static flashcard app for studying AWS certification exams. Tracks your progress per question, supports bookmarks, and works offline as a PWA.

Live at: https://donchong2000.github.io/flashcard

## Features

- Practice by topic set or all questions at once
- Filter to review only incorrect or bookmarked questions
- Random exam mode (65-question shuffle)
- Progress tracked in localStorage — persists across sessions
- Export/import progress as JSON (for backup or cross-device sync)
- Keyboard shortcuts: `1–6` select options, `Enter`/`Space` submit or advance, `→` advance after reveal, `B` bookmark
- Installable PWA, works offline after first visit

## Development

```bash
pnpm install
pnpm dev      # processes data, then starts dev server at localhost:3000/flashcard
```

## Adding question banks

1. Place a `.json` file in `data/` following this schema:

```json
{
  "questions": [{
    "question_number": 1,
    "topic": 1,
    "question": "...",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "correct_answer": ["A"],
    "community_votes": { "A": 98 },
    "discussion": [{ "username": "...", "upvotes": 70, "comment": "...", "selected": ["A"] }]
  }]
}
```

2. Run `pnpm dev` or `pnpm build` — the data processor generates `public/data/` automatically.

The slug is derived from the filename (`SAA-C03.json` → `saa_c03`). Multiple datasets are supported; a selector appears in the UI when more than one is present.

## Build & deploy

```bash
pnpm build    # outputs static site to out/
pnpm deploy   # pushes out/ to the gh-pages branch
```

The app is a fully static Next.js export with `basePath: "/flashcard"`. No server required.
