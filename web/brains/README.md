# Brains

- `current.json` — live v7 snapshot (gru-v7, 9320 steps). Fresh installs load this if the phone has no saved brain.
- `public.json` — metadata only. Do not put extra personal memories here.
- **Base brain (locked 2026-09-08):** `nova-v7-0` — gru-v7 at steps 0. This is the frozen init, not the live snapshot. Do not train over this file; train from a copy.

## Base snapshot (frozen)

- id: `nova-v7-0`
- kind: `gru-v7`
- hidden: 64
- steps: 0
- loss: null
- lessons: 3 seed
  - "what is your name" → "nova."
  - "good morning" → "good morning."
  - "goodbye" → "bye."
- set: 2026-09-08
- status: locked base — do not replace unless you intentionally re-init the architecture

## Current snapshot

- id: `nova-v7-9320`
- kind: `gru-v7`
- hidden: 64
- steps: 9320
- loss: 0.290 / ema 0.272
- lessons: 33
- set: 2026-09-07

## v61: seed brain, import, strip

- **Status:** `current.json` is **not in the repo yet**. It is added in a follow-up commit once the creator's exported file arrives. Until then a fresh phone gets a 404 and keeps its random init, exactly as before.
- **Seed loading:** on a phone with no saved brain (`nova-tiny-brain-v7` empty), `train.js` fetches `brains/current.json?v=61`, validates it and loads the weights and step count. A phone that already has a brain is never touched. The service worker caches the file so it works offline after the first visit.
- **Weights only:** `current.json` must contain only `kind`, `hidden`, `vocab`, `alphabet`, `steps`, `loss`, `ema` and `weights`. No lessons, memories, notes, diary, journal or taught senses.
- **Strip a file:** `node scripts/strip-brain.mjs <exported.json> web/brains/current.json`. If the file says `steps: 0` (old export bug), the Adam counter `t` is used.
- **Import:** say `import brain` (or Brain menu > Import brain) and pick a `nova-v7-*.json` file. The current brain is backed up to `nova-tiny-brain-v7-backup` first; only weights and steps are loaded, so the phone's own lessons stay. `undo import` restores the backup. Bad files are rejected and nothing changes.
- **Export:** `export brain` is read-only and saves weights + steps only. `export lessons` saves the lessons separately, so you choose what to share.

## Release a snapshot

1. In Nova say `export brain` and save the file.
2. Run `node scripts/strip-brain.mjs <file> web/brains/current.json` (weights only).
3. Commit `current.json` on `main`.
4. Bump the id in `public.json`.
5. Keep training on your phone. The shipped file stays frozen until you replace it.
6. Never overwrite the locked base (`nova-v7-0`) with a trained checkpoint.
