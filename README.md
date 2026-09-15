# Nova

Personal assistant. Local first. No App Store. No Siri. No cloud API keys.

## Open Nova (iPhone only — no computer)

1. On iPhone **Safari**, open: **https://wolfplayz07.github.io/Nova-AI/**
2. Tap **Share** → **Add to Home Screen** → Add.
3. Open the **Nova** icon. Chat and learning stay on this phone (IndexedDB / localStorage).

Until Pages publishes, preview: [htmlpreview](https://htmlpreview.github.io/?https://github.com/wolfplayz07/Nova-AI/blob/main/web/index.html)

## Learn while you talk

Learning defaults **OFF**. When ON, each chat/speech turn appends a `you:` / `nova:` pair and runs background Adam steps on the v7 GRU (same brain lineage: `nova-tiny-brain-v7`). When OFF, chat still works; **weights freeze**.

### Start (learning ON)

```
start learning
learn from me
train
start training
```

Or tap **Learn**.

### Stop (learning OFF — freeze weights)

```
stop learning
pause
stop
pause train
stop train
stop training
```

Or tap **Stop**. Status chip shows **learning · N steps** vs **not learning · N steps**.

### Other

```
sample
train status
reset brain confirm
```

Explicit teaches (`when i say … say …`, `fix: …`) always save to the lesson buffer; weight updates only while learning is ON.

### After “I do not know”

Just say the answer on the next line (or `Say no`, `the answer is …`). Nova saves that as the lasting reply for the question — no computer, no special app. Say `skip` to cancel.

### Voice

If Web Speech API works in your Safari Home Screen build, tap **mic**. If not, the button explains: use the **keyboard dictation mic**, then Send — same learn ON/OFF path. We do not fake speech recognition.

## What this is

**v7** is a 64-unit GRU character model on-device. It will not talk like Grok. Brain checkpoints stay in localStorage + IndexedDB (OPFS when available). No cloud weights.

The long path (Swift shell + scratch trainer) is in [ROADMAP.md](ROADMAP.md).
