#!/usr/bin/env python3
"""From-scratch Nova trainer. Random init. Your checkpoints only."""
from __future__ import annotations

import argparse
import math
import os
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CKPT_DIR = ROOT / "checkpoints"
CKPT = CKPT_DIR / "nova-scratch.pt"


def read_corpus() -> str:
    parts = []
    if DATA.exists():
        for p in sorted(DATA.glob("*.txt")):
            parts.append(p.read_text(encoding="utf-8", errors="ignore"))
    text = "\n".join(parts).lower()
    if len(text) < 200:
        raise SystemExit("Need more text in scratch/data/*.txt")
    return text


class GPT(nn.Module):
    def __init__(self, vocab: int, n_embd: int, n_head: int, n_layer: int, block: int):
        super().__init__()
        self.block = block
        self.tok = nn.Embedding(vocab, n_embd)
        self.pos = nn.Embedding(block, n_embd)
        self.drop = nn.Dropout(0.1)
        layer = nn.TransformerEncoderLayer(
            d_model=n_embd,
            nhead=n_head,
            dim_feedforward=n_embd * 4,
            batch_first=True,
            dropout=0.1,
            activation="gelu",
        )
        self.tr = nn.TransformerEncoder(layer, num_layers=n_layer)
        self.ln = nn.LayerNorm(n_embd)
        self.head = nn.Linear(n_embd, vocab, bias=False)

    def forward(self, idx):
        b, t = idx.shape
        x = self.tok(idx) + self.pos(torch.arange(t, device=idx.device))
        x = self.drop(x)
        # causal mask
        mask = torch.triu(torch.ones(t, t, device=idx.device), diagonal=1).bool()
        x = self.tr(x, mask=mask)
        return self.head(self.ln(x))


def main() -> None:
    ap = argparse.ArgumentParser(description="Train Nova from random weights")
    ap.add_argument("--steps", type=int, default=1500)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--block", type=int, default=64)
    ap.add_argument("--embd", type=int, default=128)
    ap.add_argument("--layers", type=int, default=4)
    ap.add_argument("--heads", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--resume", action="store_true", help="continue YOUR last checkpoint")
    args = ap.parse_args()

    text = read_corpus()
    chars = sorted(set(text))
    stoi = {c: i for i, c in enumerate(chars)}
    itos = {i: c for c, i in stoi.items()}
    data = torch.tensor([stoi[c] for c in text], dtype=torch.long)
    print(f"corpus {len(text)} chars, vocab {len(chars)}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("device", device)

    model = GPT(len(chars), args.embd, args.heads, args.layers, args.block).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    start = 0

    if args.resume and CKPT.exists():
        pack = torch.load(CKPT, map_location=device, weights_only=False)
        if pack.get("kind") != "nova-scratch-v1":
            raise SystemExit("checkpoint is not a Nova scratch file")
        if pack["chars"] != chars:
            raise SystemExit("vocab changed; add text carefully or start a new run")
        model.load_state_dict(pack["model"])
        start = pack.get("step", 0)
        print("resumed your checkpoint at step", start)

    def batch():
        ix = torch.randint(0, len(data) - args.block - 1, (args.batch,))
        x = torch.stack([data[i : i + args.block] for i in ix])
        y = torch.stack([data[i + 1 : i + args.block + 1] for i in ix])
        return x.to(device), y.to(device)

    model.train()
    for step in range(start + 1, start + args.steps + 1):
        x, y = batch()
        logits = model(x)
        loss = F.cross_entropy(logits.reshape(-1, logits.size(-1)), y.reshape(-1))
        opt.zero_grad(set_to_none=True)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        if step == 1 or step % 50 == 0 or step == start + args.steps:
            print(f"step {step} loss {loss.item():.4f}")

    CKPT_DIR.mkdir(exist_ok=True)
    torch.save(
        {
            "kind": "nova-scratch-v1",
            "model": model.state_dict(),
            "chars": chars,
            "stoi": stoi,
            "itos": itos,
            "step": start + args.steps,
            "cfg": vars(args),
        },
        CKPT,
    )
    nparams = sum(p.numel() for p in model.parameters())
    print(f"saved {CKPT} ({nparams} params). this file is your lineage.")


if __name__ == "__main__":
    main()
