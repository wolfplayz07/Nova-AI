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

## Release a snapshot

1. In Nova say `export brain` and save the file.
2. Confirm it has no private memories you do not want public.
3. Replace `current.json` on `main`.
4. Bump the id in `public.json`.
5. Keep training on your phone. The shipped file stays frozen until you replace it.
6. Never overwrite the locked base (`nova-v7-0`) with a trained checkpoint.
