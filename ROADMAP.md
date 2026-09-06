# Nova path

Two tracks. The PWA trainer is the lab. The Swift app is the product.

## Track A — v3 phrase brain (this week)

JavaScript RNN on the Home Screen icon.

- Hidden size 32, window 24 characters
- Stored as `nova-tiny-brain-v3` (v2 16-unit weights stay on the phone, unused)
- Goal: 15–40 short, stable replies
- Not a conversation engine

Do not keep raising steps/sec on v2. That brain is full.

## Track B — talk like a real assistant (the goal)

Ship a small language model inside the iOS app (`Nova-AI`), Home Screen / not App Store.

### Why the PWA cannot get there

~5k weights, next-letter training, 24-char memory. That is a phrase book.
A chat model that feels like Grok needs millions to billions of weights and a different decoder.

### Stages

1. **Swift shell** 
   Wrap the current UI (chats, memories, Train button) in the iOS project you already started.
   PWA stays as the fallback icon.

2. **First on-device LM** 
   Bundle a small instruct model (Phi-3 mini / Qwen 0.5B–1.5B class, GGUF or MLX).
   Run with llama.cpp or MLX on Neural Engine / GPU, not JS loops.
   Expect slow first-token on older phones; fine on recent ones.

3. **Local memory** 
   Keep `remember X is Y` and chat history in the same local store.
   Inject a short system prompt + last messages + memories into the LM context.
   That is how it starts to feel like *your* Nova.

4. **Optional private cloud** 
   When the phone model is not enough, call a private endpoint you control.
   Same UI. Local memory still wins if the network is gone.

### What not to do

- Do not train a 32-unit RNN hoping it becomes GPT.
- Do not hit an official ChatGPT/Grok API if the rule is local-first (unless you later choose a cloud tier on purpose).
- Do not wipe memories when swapping brains.

### Success test

You can type something that was never in a canned list and get a relevant English sentence, on device, with your name remembered.
