/* v61: seed brain for fresh phones, import/undo import, and the weights-only strip script. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { boot } from "./harness.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["brain-strip.js", "train.js", "lookup.js", "app.js"];
const H = 64, V = 44;
const SIZES = { Wxz: H * V, Wxr: H * V, Wxn: H * V, Uz: H * H, Ur: H * H, Un: H * H, bz: H, br: H, bn: H, Why: V * H, by: V };
function fakeExport(steps, fill, extra = {}) {
  const model = { kind: "gru-v7", steps, loss: 0.5, ema: 0.4, t: steps };
  for (const [k, n] of Object.entries(SIZES)) model[k] = new Array(n).fill(fill);
  return { model, mW: {}, vW: {}, lessons: [{ user: "my secret", nova: "private memory" }], reading: "diary text",
    notes: ["note"], journal: ["j"], senses: { bark: ["dog"] }, ...extra };
}
const STORE = "nova-tiny-brain-v7";
const fetchOf = (body, ok = true) => async (url) => {
  fetchOf.last = url;
  return { ok, status: ok ? 200 : 404, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
};
const saved = (n) => JSON.parse(n.localStorage.getItem(STORE) || "null");

test("fresh phone loads the seed brain (weights only, cache-busted URL)", async () => {
  const n = boot({ files: FILES, globals: { fetch: fetchOf(fakeExport(9320, 0.01)) } });
  assert.equal(await n.T().seedReady(), "seed");
  assert.equal(fetchOf.last, "brains/current.json?v=61");
  assert.equal(n.T().status().steps, 9320);
  const s = saved(n);
  assert.equal(s.model.steps, 9320);
  assert.deepEqual(s.lessons, []);
  assert.ok(!JSON.stringify(s).includes("secret"));
  n.stop();
});

test("missing current.json (404) keeps the random init", async () => {
  const n = boot({ files: FILES, globals: { fetch: fetchOf("", false) } });
  assert.equal(await n.T().seedReady(), "missing");
  assert.equal(n.T().status().steps, 0);
  n.stop();
});

test("existing brain is never overwritten by the seed", async () => {
  const mine = fakeExport(123, 0.02);
  let called = false;
  const n = boot({ files: FILES, seed: { [STORE]: JSON.stringify(mine) },
    globals: { fetch: async () => { called = true; return { ok: true, text: async () => JSON.stringify(fakeExport(9320, 0.01)) }; } } });
  assert.equal(await n.T().seedReady(), "own");
  assert.equal(called, false);
  assert.equal(n.T().status().steps, 123);
  assert.equal(saved(n).model.steps, 123);
  n.stop();
});

test("bad files are rejected and the brain is untouched", () => {
  const n = boot({ files: FILES, seed: { [STORE]: JSON.stringify(fakeExport(50, 0.03)) } });
  const before = n.localStorage.getItem(STORE);
  const wrongKind = fakeExport(1, 0.1); wrongKind.model.kind = "gru-v6";
  const wrongSize = fakeExport(1, 0.1); wrongSize.model.Uz = [1, 2, 3];
  const noWeights = { model: { kind: "gru-v7", steps: 5 } };
  const wrongHidden = fakeExport(1, 0.1); wrongHidden.model.hidden = 128;
  for (const bad of ["not json", JSON.stringify(wrongKind), JSON.stringify(wrongSize), JSON.stringify(noWeights), JSON.stringify(wrongHidden)]) {
    assert.match(n.T().importBrainText(bad), /^Import failed: .* Your current brain was not changed\./);
    assert.equal(n.localStorage.getItem(STORE), before);
    assert.equal(n.localStorage.getItem(STORE + "-backup"), null);
  }
  assert.equal(n.T().status().steps, 50);
  n.stop();
});

test("import backs up, loads weights only, reports steps; undo import restores", () => {
  const mine = fakeExport(50, 0.03); mine.lessons = [{ user: "hello", nova: "hey." }]; mine.reading = "";
  const n = boot({ files: FILES, seed: { [STORE]: JSON.stringify(mine) } });
  const out = n.T().importBrainText(JSON.stringify(fakeExport(777, 0.05)));
  assert.match(out, /Brain imported: 777 steps/);
  assert.equal(JSON.parse(n.localStorage.getItem(STORE + "-backup")).model.steps, 50);
  const s = saved(n);
  assert.equal(s.model.steps, 777);
  assert.deepEqual(s.lessons, [{ user: "hello", nova: "hey." }]);
  assert.ok(!JSON.stringify(s).includes("secret") && !JSON.stringify(s).includes("diary"));
  assert.match(n.say("undo import"), /Import undone\. Back to your old brain: 50 steps\./);
  assert.equal(saved(n).model.steps, 50);
  assert.equal(n.T().status().steps, 50);
  assert.equal(n.say("undo import"), "There is no import to undo.");
  n.stop();
});

test("strip script removes lessons, memories and free text", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "strip-"));
  const inp = path.join(dir, "in.json"), out = path.join(dir, "out.json");
  fs.writeFileSync(inp, JSON.stringify(fakeExport(9320, 0.01, { memories: { name: "someone" }, diary: "dear diary" })));
  execFileSync("node", [path.join(ROOT, "scripts/strip-brain.mjs"), inp, out]);
  const b = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.deepEqual(Object.keys(b).sort(), ["alphabet", "ema", "hidden", "kind", "loss", "steps", "vocab", "weights"]);
  assert.equal(b.kind, "gru-v7"); assert.equal(b.hidden, 64); assert.equal(b.vocab, 44); assert.equal(b.steps, 9320);
  assert.deepEqual(Object.keys(b.weights).sort(), Object.keys(SIZES).sort());
  const txt = fs.readFileSync(out, "utf8");
  for (const w of ["secret", "private", "diary", "lessons", "memories", "journal", "senses", "notes", "someone"]) assert.ok(!txt.includes(w), w);
  // a stripped file is itself importable
  const n = boot({ files: FILES });
  assert.match(n.T().importBrainText(txt), /Brain imported: 9320 steps/);
  n.stop();
});

test("cache versions bumped together", () => {
  const html = fs.readFileSync(path.join(ROOT, "web/index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "web/sw.js"), "utf8");
  assert.ok(!/\?v=60/.test(html) && /brain-strip\.js\?v=61/.test(html));
  assert.match(sw, /nova-local-v61/);
  assert.match(sw, /brains\/current\.json\?v=61/);
});

test("export brain is read-only: steps and weights identical after export and after a reload", () => {
  const n = boot({ files: FILES, seed: { [STORE]: JSON.stringify(fakeExport(5281, 0.02)) } });
  const before = n.localStorage.getItem(STORE);
  const w0 = Array.from(n.T().brainJSON(false).model.Wxz);
  assert.equal(n.T().status().steps, 5281);
  const msg = n.say("export brain");
  assert.match(msg, /nova-v7-5281\.json/);
  assert.equal(n.localStorage.getItem(STORE), before);
  assert.equal(n.T().status().steps, 5281);
  assert.deepEqual(Array.from(n.T().brainJSON(false).model.Wxz), w0);
  // exported file carries steps and no lessons
  const file = n.T().brainJSON(false);
  assert.equal(file.model.steps, 5281);
  assert.equal(file.lessons, undefined);
  n.stop();
  // simulated reload from the same storage
  const seed = Object.fromEntries([STORE, STORE + "-steps"].map((k) => [k, n.localStorage.getItem(k)]).filter(([, v]) => v != null));
  const r = boot({ files: FILES, seed });
  assert.equal(r.T().status().steps, 5281);
  assert.deepEqual(Array.from(r.T().brainJSON(false).model.Wxz), w0);
  r.stop();
});

test("steps survive a reload even if the saved file says 0 (uses t or the steps key)", () => {
  const b = fakeExport(0, 0.02); b.model.t = 5281;
  const n = boot({ files: FILES, seed: { [STORE]: JSON.stringify(b) } });
  assert.equal(n.T().status().steps, 5281);
  n.stop();
  const m = boot({ files: FILES, seed: { [STORE]: JSON.stringify(fakeExport(0, 0.02)), [STORE + "-steps"]: "5281" } });
  assert.equal(m.T().status().steps, 5281);
  m.stop();
});

test("import keeps the file's steps; 0-step export falls back to t", () => {
  const n = boot({ files: FILES });
  const b = fakeExport(0, 0.02); b.model.t = 4000;
  assert.match(n.T().importBrainText(JSON.stringify(b)), /Brain imported: 4000 steps/);
  const z = fakeExport(0, 0.02); z.model.t = 0;
  assert.match(n.T().importBrainText(JSON.stringify(z)), /Brain imported: 0 steps/);
  n.stop();
});

test("export lessons is separate from export brain", () => {
  const n = boot({ files: FILES });
  assert.match(n.say("export lessons"), /nova-lessons-\d+\.json/);
  n.stop();
});
