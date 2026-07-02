# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev           # process data then start dev server
pnpm build         # process data then build static export to out/
pnpm test          # Jest data-validation tests (no UI tests exist)
node scripts/process-data.mjs  # run data processor standalone

# Run a single test file
node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/data.test.mjs
```

There is no `pnpm start` useful in dev — the app is a static export. `pnpm lint` is broken in interactive terminals (prompts for ESLint config); use `npx tsc --noEmit` instead.

## Architecture

**Static Next.js export** deployed to GitHub Pages at `/flashcard`. No Next.js server or API routes — all page data is fetched client-side from pre-generated JSON in `public/data/`. The one server-side piece is a small **Cloudflare Worker** (`worker/`) used only for cross-device progress sync (see Sync below).

### Deployment

- **Site**: GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys `out/` to GitHub Pages via `actions/deploy-pages@v4` on push to `main`. The `pnpm deploy` script (gh-pages package) is a manual fallback, not the CI path.
- **Worker**: no CI — deploy manually with `wrangler deploy` from `worker/`.

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

`lib/manifest.ts` fetches and caches `manifest.json` in a module-level singleton (no expiry). Topic JSON files are **not cached** — fetched fresh each quiz start. `BASE_PATH` (`/flashcard`) is prepended to all fetch URLs — set via `NEXT_PUBLIC_BASE_PATH` env var (defaults to `/flashcard`). Import it from `lib/constants.ts`.

### Local storage

`lib/progress.ts` manages progress under keys `flashcard_progress_{slug}`. The store is `Record<question_number, QuestionProgress>`. All reads/writes go through the private `save(slug, store)` helper (which uses the `key(slug)` helper) — never write directly to localStorage using the raw key string. Progress is written on every answer and bookmark toggle — no batching.

`lib/preferences.ts` remembers the last selected dataset under `flashcard_selected_dataset`.

`lib/bitmap.ts` provides `numbersToHex` / `hexToNumbers` for compact export: question numbers are packed MSB-first into hex strings (1 bit per question). Called only by `exportProgress` / `importProgress` in `lib/progress.ts`; sync snapshots reuse that already-encoded hex output (`lib/sync.ts` never calls bitmap functions directly).

### Sync (Cloudflare Worker + KV)

- `worker/src/index.js` — Worker `flashcard-sync` (`worker/wrangler.toml`, KV binding `FLASHCARD_SYNC`) exposing `GET/PUT /sync/{hash}/{slug}` for progress snapshots (validates a `version: 1` schema).
- `lib/constants.ts` — `SYNC_API` defaults to `https://flashcard-sync.donchong2000.workers.dev`, overridable via `NEXT_PUBLIC_SYNC_API`.
- `lib/sync.ts` — client: generates/stores a sync ID in localStorage `flashcard_sync_id`; `pullRemote`/`pushRemote` talk to the Worker; `flashcard_last_synced_{slug}` keeps the last-synced snapshot for diffing.
- `app/page.tsx` — auto pull/push on mount, adopts a foreign sync ID via `?sync=HASH` link, "Copy Link" shares it, plus a manual Sync button.

### Quiz page pattern

`app/quiz/page.tsx` uses `useSearchParams` which requires a `<Suspense>` boundary for static export compatibility. The actual logic lives in `QuizContent` (inner component), wrapped by the exported `QuizPage`. URL params: `?dataset={slug}&topic={N|all}&filter={...}&random={N}&tags={...}`. Valid filters are `QUIZ_FILTERS` in `lib/types.ts`: `all | correct | incorrect | unseen | bookmarked | bookmarked+incorrect`.

The `random` param shuffles the filtered question list and slices it to N questions. The home page uses `RANDOM_EXAM_SIZE = 65` for its "Random exam" card.

On mount, `QuizContent` fetches questions, applies the filter (in-memory, one-time), then seeks to the first unseen question. Filtering is not reactive — changing the filter requires a new navigation.

`components/QuestionCard.tsx` handles keyboard shortcuts: `1–6` select options, `Enter`/`Space` submits or advances, `→` advances when revealed, `B` toggles bookmark.

### UI components

`components/ui/` contains manually written shadcn-style primitives (Button, Card, Badge, Progress, Collapsible, Select) backed by Radix UI primitives + Tailwind. CSS variables for theming are in `app/globals.css`. Use `cn()` from `lib/utils.ts` (`twMerge` + `clsx`) for all className composition.

### basePath

`next.config.ts` sets `basePath: "/flashcard"`. Next.js automatically prepends this to all `router.push()` calls — do **not** include it manually. Only `fetch()` URLs need the prefix, using `BASE_PATH` imported from `lib/constants.ts`.

### PWA

A manually-written service worker lives at `public/sw.js`. It uses three named caches keyed by a `VERSION` constant at the top of the file. Bump `VERSION` when you need to invalidate all caches (e.g. after changing cached shell URLs or cache strategies).

### Tests

Jest with `--experimental-vm-modules`. Only `__tests__/data.test.mjs` exists — it validates source JSON schema (uniqueness, required fields, answer key consistency). No UI or component tests.

### Inspecting question data

```bash
# Fetch a question by number (top 5 discussion comments only)
node -e "const d=require('./data/SAA-C03.json'); const q={...d.questions.find(q=>q.question_number===86)}; q.discussion=q.discussion.slice(0,5); console.log(JSON.stringify(q,null,2))"

# List questions by tag
node -e "const d=require('./data/SAA-C03.json'); d.questions.filter(q=>(q.tags||[]).includes('Databases')).forEach(q=>console.log('Q'+q.question_number, q.tags.join(', '),'|',q.question.slice(0,80)))"

# Search question text by keyword
node -e "const d=require('./data/SAA-C03.json'); d.questions.filter(q=>q.question.toLowerCase().includes('rotate')).forEach(q=>console.log('Q'+q.question_number, q.question.slice(0,80)))"
```
