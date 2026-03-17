# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev           # process data then start dev server
pnpm build         # process data then build static export to out/
pnpm test          # Jest data-validation tests (no UI tests exist)
pnpm deploy        # deploy out/ to GitHub Pages via gh-pages
node scripts/process-data.mjs  # run data processor standalone
```

There is no `pnpm start` useful in dev — the app is a static export. `pnpm lint` is broken in interactive terminals (prompts for ESLint config); use `npx tsc --noEmit` instead.

## Architecture

**Static Next.js export** deployed to GitHub Pages at `/flashcard`. No server, no API routes. All data is fetched client-side from pre-generated JSON files in `public/data/`.

### Data pipeline

Source files live in `data/*.json`. Before each build/dev, `scripts/process-data.mjs` runs and:
- Groups questions by `topic` field per source file
- Writes `public/data/{slug}/topic-{N}.json` and `public/data/{slug}/all.json`
- Writes `public/data/manifest.json` listing all datasets

Slug is derived from the filename (e.g. `SAA-C03.json` → `saa_c03`). To add a new question bank: drop a `.json` file in `data/` with the same schema (top-level `questions` array), rebuild.

**Source JSON schema:**
```json
{
  "questions": [{
    "question_number": 1,
    "topic": 1,
    "question": "...",
    "options": { "A": "...", "B": "..." },
    "correct_answer": ["A"],
    "community_votes": { "A": 98 },
    "discussion": [{ "username": "...", "upvotes": 70, "comment": "...", "selected": ["A"] }]
  }]
}
```

### Client data loading

`lib/manifest.ts` fetches and caches `manifest.json` in a module-level singleton (no expiry). Topic JSON files are **not cached** — fetched fresh each quiz start. `BASE_PATH` (`/flashcard`) is prepended to all fetch URLs — set via `NEXT_PUBLIC_BASE_PATH` env var (defaults to `/flashcard`).

### Progress storage

`lib/progress.ts` manages all localStorage under keys `flashcard_progress_{slug}`. The store is `Record<question_number, QuestionProgress>`. All reads/writes go through the private `save(slug, store)` helper (which uses the `key(slug)` helper) — never write directly to localStorage using the raw key string. Progress is written on every answer and bookmark toggle — no batching.

`lib/bitmap.ts` provides `numbersToHex` / `hexToNumbers` for compact export: question numbers are packed MSB-first into hex strings (1 bit per question). Used only by `exportProgress` / `importProgress` in `lib/progress.ts`.

### Quiz page pattern

`app/quiz/page.tsx` uses `useSearchParams` which requires a `<Suspense>` boundary for static export compatibility. The actual logic lives in `QuizContent` (inner component), wrapped by the exported `QuizPage`. URL params: `?dataset={slug}&topic={N|all}&filter={all|incorrect|bookmarked|bookmarked+incorrect}`.

On mount, `QuizContent` fetches questions, applies the filter (in-memory, one-time), then seeks to the first unseen question. Filtering is not reactive — changing the filter requires a new navigation.

`components/QuestionCard.tsx` handles keyboard shortcuts: `1–6` select options, `Enter`/`Space` submits or advances, `→` advances when revealed, `B` toggles bookmark.

### UI components

`components/ui/` contains manually written shadcn-style primitives (Button, Card, Badge, Progress, Collapsible, Select) backed by Radix UI primitives + Tailwind. CSS variables for theming are in `app/globals.css`. Use `cn()` from `lib/utils.ts` (`twMerge` + `clsx`) for all className composition.

### basePath

`next.config.ts` sets `basePath: "/flashcard"`. All internal `router.push()` calls and fetch URLs must include this prefix. The constant `BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/flashcard"` is defined at the top of each page file that needs it.

### Tests

Jest with `--experimental-vm-modules`. Only `__tests__/data.test.mjs` exists — it validates source JSON schema (uniqueness, required fields, answer key consistency). No UI or component tests.
