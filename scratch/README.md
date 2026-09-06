# Nova from-scratch trainer

This is **your** model. Random weights. No Phi, no Llama, no download.

It will not talk like Grok. It is the next size up from the phone v4 toy:
a tiny GPT you train on a computer.

## Setup

```bash
cd scratch
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Data

Put plain text in `data/`.

- `data/seed.txt` ships with a tiny starter so the script runs.
- Add more `.txt` files (public-domain books, your writing, exported Nova lessons).
- More text = better. Pages are weak. Megabytes start to matter.

## Train

```bash
python train.py
```

Checkpoints write to `checkpoints/nova-scratch.pt`.
That file is the lineage. Keep copies as you grow the net.

Useful knobs:

```bash
python train.py --steps 2000 --block 64 --embd 128 --layers 4 --heads 4
```

CPU is fine for the default size. A GPU (Colab free T4) makes bigger nets possible.
Never pass `--init` from someone else's `.pt`. Don't load outside checkpoints if you want a pure line.

## Sample

```bash
python sample.py --prompt "hello"
```

## How this relates to the phone

The Home Screen v4 brain is separate. This trainer does **not** upload into iPhone localStorage.
Later we can export a tiny format the app understands. First job: grow *these* weights on a computer.
