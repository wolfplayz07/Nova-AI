#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import torch
import torch.nn.functional as F

from train import CKPT, GPT


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", default="hello")
    ap.add_argument("--n", type=int, default=200)
    args = ap.parse_args()

    if not CKPT.exists():
        raise SystemExit("no checkpoint. run python train.py first.")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    pack = torch.load(CKPT, map_location=device, weights_only=False)
    if pack.get("kind") != "nova-scratch-v1":
        raise SystemExit("not a Nova scratch checkpoint")

    cfg = pack["cfg"]
    chars = pack["chars"]
    stoi = pack["stoi"]
    itos = {int(k): v for k, v in pack["itos"].items()} if isinstance(next(iter(pack["itos"].keys())), str) else pack["itos"]
    model = GPT(len(chars), cfg["embd"], cfg["heads"], cfg["layers"], cfg["block"]).to(device)
    model.load_state_dict(pack["model"])
    model.eval()

    prompt = args.prompt.lower()
    idx = [stoi.get(c, 0) for c in prompt]
    x = torch.tensor([idx], dtype=torch.long, device=device)
    block = cfg["block"]
    with torch.no_grad():
        for _ in range(args.n):
            logits = model(x[:, -block:])[:, -1]
            p = F.softmax(logits, dim=-1)
            nxt = torch.multinomial(p, 1)
            x = torch.cat([x, nxt], dim=1)
    out = "".join(itos[int(i)] for i in x[0].tolist())
    print(out)


if __name__ == "__main__":
    main()
