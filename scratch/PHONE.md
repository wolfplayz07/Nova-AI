# What GitHub on-device trainers actually give us

Looked at browser/phone training repos. Pattern is the same as Nova: tiny GPT in JS, your data, no server.

## Repos worth knowing

- [jayyvk/trainmyowngpt](https://github.com/jayyvk/trainmyowngpt) — Karpathy microgpt in a Web Worker. ~4k params. Same league as v4, nicer architecture (attention).
- [kylemath/microgptJS](https://github.com/kylemath/microgptJS) — one-file GPT + Adam, worker so the UI does not freeze.
- [minusxai/quectoGPT](https://github.com/minusxai/quectoGPT) — WebGPU GPT. Chrome, not iOS Safari.
- [toprakdeviren/webgpu-llm](https://github.com/toprakdeviren/webgpu-llm) — train a transformer in-tab on WebGPU. Needs `navigator.gpu`.
- [tensorflow/tfjs-examples lstm-text-generation](https://github.com/tensorflow/tfjs-examples) — LSTM text gen, saves to **IndexedDB** (the storage lesson).
- [0hq/WebGPT](https://github.com/0hq/WebGPT) — inference, not training. WebGPU.
- [premananda108/NeuralPocketWeb](https://github.com/premananda108/NeuralPocketWeb) — runs Gemma in-browser; uses **OPFS** for big files. Inference of someone else's weights.

## What they maximize that we did not

1. **IndexedDB / OPFS** instead of localStorage (~5MB cap). IDB is tens to hundreds of MB on iPhone.
2. **Web Worker** so Train does not jank the chat UI.
3. **Binary weights**, not JSON strings.
4. **Adam** instead of plain SGD.
5. **Transformer** instead of a 32-unit RNN — same phone, better memory of the last tokens.
6. **WebGPU** — real speed. Safari on iPhone still weak/absent for this. Most of those demos want Chrome on a laptop.

## What they do not magically do

None of them turn a phone tab into Grok. The honest ones say ~4k–500k params in-browser. WebGPU repos that claim millions assume a desktop GPU.

iOS Home Screen = Safari engine. If a README says WebGPU, treat it as "not your icon."

## What we took

`web/idb.js` copies the v4 brain into IndexedDB so a full localStorage quota does not eat the lineage.
