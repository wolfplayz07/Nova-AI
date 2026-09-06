# Brains

- `public.json` — what everyone loads from the website. No personal facts.
- Each phone also keeps a private brain in browser storage (`nova-tiny-brain-v1`).

## Release a snapshot later

1. In Nova say `export brain` and save the file.
2. Open it and confirm it has no private memories.
3. Replace `public.json` on `main`.
4. Bump `id` to `nova-public-v0.1`, `v0.2`, …
5. Keep training on your phone. Public file stays frozen until you replace it again.
