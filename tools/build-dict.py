#!/usr/bin/env python3
"""Build Nova's offline dictionary shards from Princeton WordNet 3.0.

Usage: python3 tools/build-dict.py /path/to/WordNet-3.0/dict web/dict

Each shard web/dict/<k>.json maps a lowercase lemma to its senses (v59: up to MAXSENSES; the
first two are the same as the v44 build, the rest follow in WordNet frequency order):
  {"river": [["n", "a large natural stream of water (larger than a creek)", ["..."], ["syn"], ""]], ...}
  [pos, gloss, examples (up to 3 short WordNet example sentences, ones using the word first),
   synonyms (other one-word lemmas of the synset, up to 3), marker ("a" attributive only,
   "p" predicative only, "ip" postnominal)]. Trailing empty fields are dropped.
tools/dict-extra.json adds common modern senses WordNet 3.0 lacks (same shape), appended.
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


MAXSENSES = 10
MAXEX = 70


def examples(g):
    return [e.strip() for e in re.findall(r'"([^"]+)"', g)]


def load_data(d, name):
    out = {}
    with open(os.path.join(d, "data." + name), encoding="latin-1") as f:
        for line in f:
            if line.startswith("  "):
                continue
            off = line.split(" ", 1)[0]
            if "|" in line:
                head, g = line.split("|", 1)
                parts = head.split()
                n = int(parts[3], 16)
                lem = [parts[4 + 2 * i].lower() for i in range(n)]
                out[off] = (short_gloss(g), examples(g), lem)
    return out


def extra_fields(word, ex, lem):
    """examples that use the word first, synonyms, adjective marker"""
    w = re.escape(word)
    pat = re.compile(r"\b" + w + r"(s|es|d|ed|ing)?\b", re.I)
    ex = [e for e in ex if len(e) <= MAXEX]
    ex = sorted(ex, key=lambda e: 0 if pat.search(e) else 1)[:3]
    mark, syns = "", []
    for l in lem:
        m = re.match(r"^(.*?)(?:\((a|p|ip)\))?$", l)
        base = m.group(1).replace("_", " ")
        if base == word:
            mark = m.group(2) or mark
        elif " " not in base and base not in syns and len(syns) < 3:
            syns.append(base)
    f = [ex, syns, mark]
    while f and not f[-1]:
        f.pop()
    return f


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
                gl = [data[o] for o in offs if data.get(o)]
                if gl:
                    lemmas.setdefault(word, []).append((tagsense, p, gl))
    entries = {}
    for word, lst in lemmas.items():
        lst.sort(key=lambda t: (-t[0], PRIO[t[1]]))
        first = lst[0]
        picked = [(first[1], first[2][0])]
        if len(lst) > 1:
            picked.append((lst[1][1], lst[1][2][0]))
        elif len(first[2]) > 1:
            picked.append((first[1], first[2][1]))
        # v59: every other sense, part of speech by part of speech, in frequency order
        for t in lst:
            for d in t[2]:
                if len(picked) >= MAXSENSES:
                    break
                if not any(d is q[1] for q in picked) and not any(d[0] == q[1][0] for q in picked):
                    picked.append((t[1], d))
        entries[word] = [[p, d[0]] + extra_fields(word, d[1], d[2]) for p, d in picked]
    extra_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dict-extra.json")
    if os.path.exists(extra_path):
        with open(extra_path) as f:
            for word, add in json.load(f).items():
                if word.startswith("_"):
                    continue
                entries.setdefault(word, [])
                for sense in add:
                    if not any(x[1] == sense[1] for x in entries[word]):
                        entries[word].append(sense)
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
