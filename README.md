# Nova-AI

Nova is a personal iPhone assistant. **Local first.** No API until you choose to add one.

## Mode right now

On-device only:

- Chat UI
- Conversations saved on the phone (SwiftData)
- Local memory: `remember my name is …`
- Simple local answers (time, date, who you are, what Nova is)
- No network calls

This is not Grok or ChatGPT yet. It is a working shell with a local brain you can grow.

## Try it

```
remember my name is Kevin
who am i
what time is it
what do you remember
```

## Later (not now)

1. Real on-device model via MLX (needs a Mac + Xcode).
2. Optional API (Groq free tier or paid Grok) behind a switch.
3. Voice inside the app (not Siri).
4. Tools with approval.

## Build on a Mac

```bash
brew install xcodegen
xcodegen generate
open NovaAI.xcodeproj
```

Target: iOS 17+, iPhone. Sideload to your own device from Xcode. No App Store.
