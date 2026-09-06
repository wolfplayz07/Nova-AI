# Nova path

Three tracks. Same goal: a Nova that is *yours*.

## Track A — phone phrase brain (done-ish)

JavaScript RNN on the Home Screen icon. Good lab. Not a conversation engine.

## Track C — from-scratch lineage (no outside weights)

Python trainer in [`scratch/`](scratch/README.md).

- Random init
- Your text in `scratch/data/`
- Checkpoints in `scratch/checkpoints/nova-scratch.pt`
- Resume only from *your* file

Grow data and model size over time. This is the purist path.

## Track B — ship a talking app

Swift app + a small on-device model when you want chat sooner.
Optional. Not required for Track C.
