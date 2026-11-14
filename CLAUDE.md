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

**Japanese-learning flashcard app** (repo `japanese-flashcard`): a **static Next.js export** deployed to GitHub Pages at `/japanese-flashcard` (https://donchong2000.github.io/japanese-flashcard). It was split off from the older multi-subject `/flashcard` app (AWS/SAA, Jyutping banks removed). No Next.js server or API routes — all page data is fetched client-side from pre-generated JSON in `public/data/`. The one server-side piece is a small **Cloudflare Worker** (`worker/`) used only for cross-device progress sync (see Sync below).

### Deployment

- **Site**: GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys `out/` to GitHub Pages via `actions/deploy-pages@v4` on push to `main`. The `pnpm deploy` script (gh-pages package) is a manual fallback, not the CI path.
- **Worker**: no CI — deploy manually with `wrangler deploy` from `worker/`.

### Same origin as the old `/flashcard` app

Both apps live on `donchong2000.github.io`, so they share localStorage and Cache Storage. On purpose, localStorage keys (`flashcard_progress_{slug}`, `flashcard_sync_id`, `flashcard_activity`, `flashcard_device_id`, …), deck slugs and the sync Worker URL are **unchanged**, so existing Kana/JLPT progress and sync carry over. Do not rename those keys or the existing `data/*.json` files (the filename is the slug). Cache names, by contrast, must stay app-specific: see PWA below.

### Decks

| Source | Built by | Display name / order |
| --- | --- | --- |
| `data/Kana.json` | hand-made | 假名 / 1 |
| `data/Head-First.json` | `scripts/build-headfirst.mjs` from `data-src/head-first/` (cards derived from https://github.com/DonChong2000/head-first-japanese) | 深入淺出日語 / 10 |
| `data/Vocab-N5.json` … `Vocab-N1.json` | `scripts/build-vocab.mjs` from `data-src/vocab/` (open-anki-jlpt-decks, MIT, based on the tanos.co.uk JLPT lists) | N5 詞彙 … N1 詞彙 / 21–25 |
| `data/JLPT-N5.json` … `JLPT-N1.json` | JLPT past papers | JLPT N5 … N1 歷屆試題 / 31–35 |

Edit the `data-src/` inputs and rerun the build script rather than hand-editing generated decks. The data files are large: change top-level fields with a node one-liner, not by hand.

Vocab sources (`data-src/vocab/n{L}.json`) carry `same` (all-kanji word that means the same in Chinese) and, for N2/N1, `ex: {ja, zh}` example sentences. Each built card has the `vocab` object of `data-src/vocab/CONTRACT.md` (kind, same, trap, past-paper frequency rank, ex) and decks set `study: true`. All-kanji words are "pick the reading" cards with rule-made near-miss readings (JLPT 問題1 style); kana words are "pick the meaning" cards; the example is shown with the word marked 【 】. `question_number` (source id), topic and correct letter must stay stable.

### Data pipeline

Source files live in `data/*.json`. Before each build/dev, `scripts/process-data.mjs` runs and:
- Groups questions by `topic` field per source file
- Writes `public/data/{slug}/topic-{N}.json` and `public/data/{slug}/all.json`
- Writes `public/data/manifest.json` listing all datasets, sorted by `order` (missing = 999) then `name`
- Clears `public/data/` first, so removed decks don't linger

Slug is derived from the filename (e.g. `JLPT-N5.json` → `jlpt_n5`). To add a new question bank: drop a `.json` file in `data/` with the same schema (top-level `questions` array), rebuild.

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

Optional top-level `name` (display name, used by the dataset selector; falls back to the humanized slug) and `order` (number) pass through to the manifest. The first dataset in manifest order is the default selection when none is stored.

Optional top-level `topic_names` (`{ "1": "易", ... }`) labels the practice-set cards and quiz header instead of "Practice Set N"; it passes through to the manifest as `topicNames`.

Optional `image` / `audio` fields hold paths under `public/` (e.g. `media/jlpt_n5/2018-07/L1-1.mp3`); `QuestionCard` renders them with `BASE_PATH` prepended. The `JLPT-N5.json` to `JLPT-N1.json` files use them for their 聴解 (listening) questions, numbered after the reading ones so existing progress keys stay stable.

### Client data loading

`lib/manifest.ts` fetches and caches `manifest.json` in a module-level singleton (no expiry). Topic JSON files are **not cached** — fetched fresh each quiz start. `BASE_PATH` (`/japanese-flashcard`) is prepended to all fetch URLs — set via `NEXT_PUBLIC_BASE_PATH` env var (defaults to `/japanese-flashcard`). Import it from `lib/constants.ts`.

### Local storage

`lib/progress.ts` manages progress under keys `flashcard_progress_{slug}`. The store is `Record<question_number, QuestionProgress>`. All reads/writes go through the private `save(slug, store)` helper (which uses the `key(slug)` helper) — never write directly to localStorage using the raw key string. Progress is written on every answer and bookmark toggle — no batching.

`lib/preferences.ts` remembers the last selected dataset under `flashcard_selected_dataset`.

`lib/activity.ts` counts answers per local day (`YYYY-MM-DD`) across all datasets, stored in `flashcard_activity` as `{ [deviceId]: { day: count } }` — the same shape in localStorage, the cloud record and export files. `mergeActivity` keeps the larger count per device and day (counts only grow), so merges are order-independent and repeatable. Only `handleAnswer` in the quiz logs it (the override doesn't). Shown on `app/activity/page.tsx` (heatmap, streak), reached from the green streak button in the home header. Reset Progress leaves it alone.

Export files are `version: 2`: the `lib/progress.ts` snapshot plus a required `activity` map. Import rejects anything else (old version 1 files included) and always merges activity, even on Replace. Sync snapshots stay `version: 1` and never carry activity.

In dev, `public/sw.js` caches the unhashed `_next/static/chunks/app/*/page.js`, so the browser can keep running old code after an edit. Unregister the service worker and clear site data (DevTools › Application) when a change doesn't show up.

`lib/bitmap.ts` provides `numbersToHex` / `hexToNumbers` for compact export: question numbers are packed MSB-first into hex strings (1 bit per question). Called only by `exportProgress` / `importProgress` in `lib/progress.ts`; sync snapshots reuse that already-encoded hex output (`lib/sync.ts` never calls bitmap functions directly).

### Sync (Cloudflare Worker + KV)

- `worker/src/index.js` — Worker `flashcard-sync` (shared with the old `/flashcard` app; deploying it affects both) (`worker/wrangler.toml`, KV binding `FLASHCARD_SYNC`) exposing `GET/PUT /sync/{hash}/{slug}` for progress snapshots (validates a `version: 1` schema). The reserved slug `_activity` holds `{ version: 1, devices: { [deviceId]: { day: count } } }`; `syncActivity` pulls it, merges with `mergeActivity`, then pushes the merged map; the displayed total is the sum over devices (`flashcard_device_id` names this one). It runs on home whenever the sync ID is known, on the Activity page, and after a file import.
- `lib/constants.ts` — `SYNC_API` defaults to `https://flashcard-sync.donchong2000.workers.dev`, overridable via `NEXT_PUBLIC_SYNC_API`.
- `lib/sync.ts` — client: generates/stores a sync ID in localStorage `flashcard_sync_id`; `pullRemote`/`pushRemote` talk to the Worker; `flashcard_last_synced_{slug}` keeps the last-synced snapshot for diffing.
- `app/page.tsx` — auto pull/push on mount, adopts a foreign sync ID via `?sync=HASH` link or the "Enter Sync ID" prompt (needed on iOS home-screen PWAs, whose storage is separate from Safari so links never reach them), "Copy Link" shares it, plus a manual Sync button. Sync, Enter Sync ID, Export, Import and Reset Progress live in the home page's "More" menu (a native `<details>`); only Start All stays visible.

### Quiz page pattern

`app/quiz/page.tsx` uses `useSearchParams` which requires a `<Suspense>` boundary for static export compatibility. The actual logic lives in `QuizContent` (inner component), wrapped by the exported `QuizPage`. URL params: `?dataset={slug}&topic={N|all}&filter={...}&random={N}&tags={...}`. Valid filters are `QUIZ_FILTERS` in `lib/types.ts`: `all | correct | incorrect | unseen | bookmarked | bookmarked+incorrect`.

The `random` param shuffles the filtered question list and slices it to N questions; `random=all` shuffles without slicing. The custom quiz builder sends `random=all` when its Random Sample box is blank, so custom quizzes are always shuffled (the practice-set cards stay in order). The home page uses `RANDOM_SAMPLE_SIZE = 20` for its "Random N" card (label capped at the deck size).

On mount, `QuizContent` fetches questions, applies the filter (in-memory, one-time), then seeks to the first unseen question. Filtering is not reactive — changing the filter requires a new navigation.

`components/QuestionCard.tsx` handles keyboard shortcuts: `1–6` select options, `Enter`/`Space` submits or advances, `→` advances when revealed, `B` toggles bookmark.

### UI components

`components/ui/` contains manually written shadcn-style primitives (Button, Card, Badge, Progress, Collapsible, Select) backed by Radix UI primitives + Tailwind. CSS variables for theming are in `app/globals.css`. Use `cn()` from `lib/utils.ts` (`twMerge` + `clsx`) for all className composition.

### basePath

`next.config.ts` sets `basePath: "/japanese-flashcard"`. Next.js automatically prepends this to all `router.push()` calls — do **not** include it manually. Only `fetch()` URLs need the prefix, using `BASE_PATH` imported from `lib/constants.ts`.

### PWA

A manually-written service worker lives at `public/sw.js`. It uses three named caches `jpflashcard-{shell,static,data}-{VERSION}`. Bump `VERSION` when you need to invalidate all caches (e.g. after changing cached shell URLs or cache strategies). On activate, `precacheDecks()` downloads every deck's `all.json` and `topic-N.json` listed in the manifest into the data cache, so all decks work offline without being opened first (listening audio under `media/` is not precached). Cache Storage is per origin and shared with the old `/flashcard` app, so the activate handler deletes only caches starting with `CACHE_PREFIX` (`jpflashcard-`); never widen that filter. The old app's `sw.js` (v5 and earlier) deletes every cache not in its own list, so it can wipe `jpflashcard-*` caches when it activates; that only costs a refetch, and is fixed by giving the old app the same prefix filter.

### Tests

Jest with `--experimental-vm-modules`. Only `__tests__/data.test.mjs` exists — it validates every `data/*.json` (uniqueness, required fields, answer key consistency, optional `name`/`order` types). No UI or component tests.

### Inspecting question data

```bash
# Fetch a question by number (top 5 discussion comments only)
node -e "const d=require('./data/JLPT-N5.json'); const q={...d.questions.find(q=>q.question_number===86)}; q.discussion=(q.discussion||[]).slice(0,5); console.log(JSON.stringify(q,null,2))"

# List each deck's name, order and size
node -e "for (const f of require('fs').readdirSync('data').filter(f=>f.endsWith('.json'))) { const d=require('./data/'+f); console.log(f, d.name, d.order, d.questions.length) }"

# Search question text by keyword
node -e "const d=require('./data/JLPT-N5.json'); d.questions.filter(q=>q.question.includes('学校')).forEach(q=>console.log('Q'+q.question_number, q.question.slice(0,80)))"
```
