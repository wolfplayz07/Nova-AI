# Nova-AI

Nova is an iPhone-first personal AI agent built around local reasoning, persistent memory, project work, and optional online tools.

## Current build: v0.1 foundation

- Native SwiftUI application shell
- Persistent local conversations with SwiftData
- Persistent memory data model
- Pluggable local-model engine
- Nova agent controller
- Working chat UI and message pipeline
- iOS 17+ target

The current `BootstrapModelEngine` lets the app and persistence layer work before the real model is installed. The next major milestone is replacing it with MLX-backed on-device inference.

## Planned next

1. Add MLX Swift / MLXLLM dependency.
2. Add downloadable quantized local model support.
3. Stream tokens into the chat UI.
4. Add memory retrieval and project workspaces.
5. Add Nova's web research tool and tool-decision loop.
6. Add approval gates for consequential external actions.
7. Add voice, camera, files, GitHub, and other tools.

## Generate the Xcode project

The repo uses `project.yml` so the Xcode project can be generated with XcodeGen in a Mac build environment.

```bash
xcodegen generate
open NovaAI.xcodeproj
```

Target: iOS 17+
