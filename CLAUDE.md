# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev           # process data then start dev server
pnpm build         # process data then build static export to out/
pnpm lint          # ESLint via next lint
pnpm deploy        # deploy out/ to GitHub Pages via gh-pages
node scripts/process-data.mjs  # run data processor standalone
```

There are no tests. There is no `pnpm start` useful in dev — the app is a static export.

## Architecture

**Static Next.js export** deployed to GitHub Pages at `/flashcard`. No server, no API routes. All data is fetched client-side from pre-generated JSON files in `public/data/`.

### Data pipeline

Source files live in `data/*.json` (same schema as `output_test.json`). Before each build/dev, `scripts/process-data.mjs` runs and:
- Groups questions by `topic` field per source file
- Writes `public/data/{slug}/topic-{N}.json` and `public/data/{slug}/all.json`
- Writes `public/data/manifest.json` listing all datasets

To add a new question bank: drop a `.json` file in `data/` with the same schema (top-level `questions` array), rebuild.

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

`lib/manifest.ts` fetches and caches `manifest.json` in-memory. Topic JSON files are fetched on demand in the quiz page. `BASE_PATH` (`/flashcard`) is prepended to all fetch URLs — set via `NEXT_PUBLIC_BASE_PATH` env var (defaults to `/flashcard`).

### Progress storage

`lib/progress.ts` manages all localStorage under keys `flashcard_progress_{slug}`. The store is `Record<question_number, QuestionProgress>`. Progress is read/written directly on every answer and bookmark toggle — no batching. The quiz page re-reads localStorage after each answer to sync React state.

### Quiz page pattern

`app/quiz/page.tsx` uses `useSearchParams` which requires a `<Suspense>` boundary for static export compatibility. The actual logic lives in `QuizContent` (inner component), wrapped by the exported `QuizPage`. URL params: `?dataset={slug}&topic={N|all}&filter={all|incorrect|bookmarked|bookmarked+incorrect}`.

### UI components

`components/ui/` contains manually written shadcn-style primitives (Button, Card, Badge, Progress, Collapsible, Select) backed by Radix UI primitives + Tailwind. CSS variables for theming are defined in `app/globals.css`.

### basePath

`next.config.ts` sets `basePath: "/flashcard"`. All internal `router.push()` calls and fetch URLs must include this prefix. The constant `BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/flashcard"` is defined at the top of each page file that needs it.
