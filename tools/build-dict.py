#!/usr/bin/env python3
"""Build Nova's offline dictionary shards from Princeton WordNet 3.0.

Usage: python3 tools/build-dict.py /path/to/WordNet-3.0/dict web/dict

Each shard web/dict/<k>.json maps a lowercase lemma to up to 2 short senses:
  {"river": [["n", "a large natural stream of water (larger than a creek)"]], ...}
Irregular forms from noun.exc / verb.exc map to their base word: {"mice": "mouse"}.
Shard key <k> is the first two characters of the word, with anything outside a-z as "_".
"""
import json, os, re, sys

POS = {"noun": "n", "verb": "v", "adj": "a", "adv": "r"}
PRIO = {"n": 0, "v": 1, "a": 2, "r": 3}
MAXLEN = 200


def short_gloss(g):
    g = g.strip()
    g = re.split(r';\s*"', g)[0]          # drop example sentences
    g = g.split(";")[0].strip()            # first clause only
    g = g.strip('"').strip()
    if len(g) > MAXLEN:
        g = re.sub(r"\s*\([^()]*\)", "", g).strip()   # long: drop asides in brackets first
    if len(g) > MAXLEN:
        cut = g[:MAXLEN].rsplit(" ", 1)[0]
        g = cut.rstrip(",;:") + "\u2026"
    return g


def load_data(d, name):
    out = {}
    with open(os.path.join(d, "data." + name), encoding="latin-1") as f:
        for line in f:
            if line.startswith("  "):
                continue
            off = line.split(" ", 1)[0]
            if "|" in line:
                out[off] = short_gloss(line.split("|", 1)[1])
    return out


def shard_key(w):
    k = ""
    for ch in (w + "__")[:2]:
        k += ch if "a" <= ch <= "z" else "_"
    return k


def main(src, dst):
    lemmas = {}  # word -> list of (tagcount, pos, [glosses])
    for name, p in POS.items():
        data = load_data(src, name)
        with open(os.path.join(src, "index." + name), encoding="latin-1") as f:
            for line in f:
                if line.startswith("  "):
                    continue
                parts = line.split()
                word = parts[0].replace("_", " ").lower()
                synset_cnt = int(parts[2])
                p_cnt = int(parts[3])
                tagsense = int(parts[5 + p_cnt])
                offs = parts[6 + p_cnt:6 + p_cnt + synset_cnt]
                gl = [data[o] for o in offs[:2] if data.get(o)]
                if gl:
                    lemmas.setdefault(word, []).append((tagsense, p, gl))
    entries = {}
    for word, lst in lemmas.items():
        lst.sort(key=lambda t: (-t[0], PRIO[t[1]]))
        first = lst[0]
        senses = [[first[1], first[2][0]]]
        if len(lst) > 1:
            senses.append([lst[1][1], lst[1][2][0]])
        elif len(first[2]) > 1:
            senses.append([first[1], first[2][1]])
        entries[word] = senses
    for name in ("noun", "verb", "adj"):
        with open(os.path.join(src, name + ".exc"), encoding="latin-1") as f:
            for line in f:
                parts = line.split()
                if len(parts) < 2:
                    continue
                form, base = parts[0].replace("_", " "), parts[1].replace("_", " ")
                if form not in entries and base in entries:
                    entries[form] = base
    shards = {}
    for w, v in entries.items():
        shards.setdefault(shard_key(w), {})[w] = v
    os.makedirs(dst, exist_ok=True)
    total = 0
    for k, m in sorted(shards.items()):
        body = json.dumps(dict(sorted(m.items())), ensure_ascii=False, separators=(",", ":"))
        with open(os.path.join(dst, k + ".json"), "w", encoding="utf-8") as f:
            f.write(body)
        total += len(body.encode("utf-8"))
    with open(os.path.join(dst, "index.json"), "w") as f:
        json.dump({"source": "Princeton WordNet 3.0", "words": len(entries),
                   "shards": sorted(shards.keys())}, f, separators=(",", ":"))
    print("words", len(entries), "shards", len(shards), "bytes", total)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
