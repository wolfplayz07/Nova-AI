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

## Offline dictionary (v44)

Ask about a word Nova has no meaning for and it checks a dictionary stored with the app. It never pretends the meaning is its own:

```
what is a river        -> dictionary says: river (noun): a large natural stream of water (larger than a creek). want me to remember it?
yes                    -> saved. river means ...      (saved as your meaning; no / skip saves nothing)
define bank / what does bank mean / look up bank / what is the meaning of bank
what else              -> the dictionary's second meaning, if it has one
teach me new words     -> offers the dictionary meaning of your most-used unknown word
download dictionary    -> keeps every part on this phone so lookups work offline (about 14 MB)
```

Your locked and saved meanings always win over the dictionary. If the dictionary has no entry, Nova asks what you mean (Skip works as before). After `stop learning` it still looks words up but does not offer to save; `start learning` turns the offer back on.

Data: `web/dict/*.json`, 550 small files sharded by the first two letters (about 13.6 MB, ~151,000 words, first 1–2 senses with part of speech), loaded one file at a time when needed. Built with `python3 tools/build-dict.py <WordNet-3.0/dict> web/dict`.

### Dictionary credit and license

Definitions come from **Princeton WordNet 3.0** — *WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.* Used under the WordNet license, which allows use, copying, modification and distribution without fee provided the copyright notice, statements and disclaimer appear on all copies. The full license text is in [`web/dict/LICENSE-WordNet.txt`](web/dict/LICENSE-WordNet.txt). See https://wordnet.princeton.edu/. Princeton University does not endorse this app.

## What this is

**v7** is a 64-unit GRU character model on-device. It will not talk like Grok. Brain checkpoints stay in localStorage + IndexedDB (OPFS when available). No cloud weights.

The long path (Swift shell + scratch trainer) is in [ROADMAP.md](ROADMAP.md).
