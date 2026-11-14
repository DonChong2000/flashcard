# Vocab card contract (build script ↔ app)

Every question in `data/Vocab-N*.json` carries a `vocab` object next to the normal multiple-choice fields:

```json
"vocab": {
  "word": "検討",            // display form (usage note tidied)
  "reading": "けんとう",      // kana; may be "" for a few source entries
  "zh": "研究、商討",         // Traditional Chinese gloss
  "en": "consideration, examination",
  "kind": "reading",          // "reading": all-kanji word, test the reading | "meaning": contains kana, test the meaning
  "same": false,              // true = same word and meaning in Chinese (meaning is free for a Chinese reader)
  "trap": true,               // all-kanji word that is NOT the same in Chinese (false friend or Japan-only word)
  "rank": 37,                 // 1 = study first; order by frequency in the JLPT past papers, ties by id
  "ex": { "ja": "新しい制度の導入を検討している。", "zh": "正在研究引入新制度。" }   // optional (N2, N1 only)
}
```

The deck's top level has `"study": true` (passed to the manifest as `study`), which turns on the spaced-repetition Study mode for that deck.
