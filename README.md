# Nova

Personal assistant. Local first. No App Store. No Siri. No API yet.

## Open Nova

**[Launch Nova](https://htmlpreview.github.io/?https://github.com/wolfplayz07/Nova-AI/blob/main/web/index.html)**

Safari on iPhone → Share → Add to Home Screen if you want an icon.

## Careful on-phone training

This is a tiny CPU toy. It will not become ChatGPT. It will not use a phone GPU.

Safeties:
- 2 training steps, then a rest
- auto-pause after 12 seconds
- auto-pause if you leave the tab
- auto-pause if battery is under 20% and unplugged
- keep Nova on screen; if the phone is warm, say `pause train`

```
train
pause train
sample
train status
reset brain
```

Weights stay in this phone's browser storage only.

## Memory file

Shared notebook (public repo — no secrets): [data/memory.json](data/memory.json)
