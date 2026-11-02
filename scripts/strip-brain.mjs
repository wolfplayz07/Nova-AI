#!/usr/bin/env node
/* v61: node scripts/strip-brain.mjs <in.json> <out.json>
   Keeps only Nova v7 weights + architecture (kind, hidden, vocab, alphabet, steps, loss, ema).
   Drops lessons, memories, notes, diary, journal, taught senses, optimizer state, free text. */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export function loadStripper() {
  const ctx = {};
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(here, "..", "web", "brain-strip.js"), "utf8"), ctx);
  return ctx.NovaBrainStrip;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [inp, out] = process.argv.slice(2);
  if (!inp || !out) { console.error("usage: node scripts/strip-brain.mjs <in.json> <out.json>"); process.exit(2); }
  const r = loadStripper().strip(fs.readFileSync(inp, "utf8"));
  if (!r.ok) { console.error("rejected: " + r.error); process.exit(1); }
  fs.writeFileSync(out, JSON.stringify(r.brain));
  console.log(`wrote ${out}: kind=${r.brain.kind} hidden=${r.brain.hidden} vocab=${r.brain.vocab} steps=${r.brain.steps} (weights only)`);
}
