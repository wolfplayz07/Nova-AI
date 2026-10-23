/* v53 self-practice: made-up problems, self-checked, misses logged; session untouched. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot } from "./harness.mjs";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
class XHR {
  open(m, url) { this.url = url; }
  send() {
    const p = path.join(WEB, this.url.split("?")[0]);
    if (fs.existsSync(p)) { this.status = 200; this.responseText = fs.readFileSync(p, "utf8"); }
    else { this.status = 404; this.responseText = ""; }
  }
}
const BASE = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js", "math-misses.js", "self-learn.js", "corrections.js", "same-as.js"];
const start = (files = [...BASE, "self-practice.js"]) => boot({ files, globals: { XMLHttpRequest: XHR } });
const misses = (n) => JSON.parse(n.localStorage.getItem("nova-math-misses-v1") || '{"misses":[]}').misses;

test("off: practice refuses, idle does nothing, replies unchanged", () => {
  const a = start(BASE), b = start();
  for (const l of ["hello", "what is 2 plus 2", "Jon has 4 cookies and Mary took 2, how many are left?", "how many are left?"]) assert.equal(b.say(l), a.say(l), l);
  assert.equal(b.say("practice math"), "self-learning is off. say \"learn on your own\" first.");
  b.ctx.NovaPractice._setLastInput(0); b.ctx.NovaPractice.idleTick();
  assert.equal(b.ctx.NovaSelf.entries().length, 0);
  a.stop(); b.stop();
});

test("practice: solved shapes are right, the stretch shape is an honest miss, misses are logged", () => {
  const n = start();
  n.say("learn on your own");
  const res = n.ctx.NovaPractice.run(70, 7);
  assert.equal(res.wrong, 0, JSON.stringify(res.misses.filter((m) => m.got)));
  assert.equal(res.right + res.none, 70);
  assert.ok(res.misses.every((m) => /how many more/.test(m.line)), JSON.stringify(res.misses));
  assert.equal(misses(n).length, res.misses.length);
  assert.match(n.say("what did you learn on your own"), /practiced 70 math problems: \d+ right, \d+ i could not do \(saved in math misses\)/);
  assert.match(n.say("practice math"), /^i practiced 20 math problems i made up: \d+ right(, \d+ i could not do)?\.( say "math misses" to see them\.)?$/);
  n.stop();
});

test("the creator's word-problem session survives practice", () => {
  const n = start();
  n.say("learn on your own");
  assert.equal(n.say("Jon has 4 cookies and Mary took 2, how many are left?"), "Jon has 2 cookies left.");
  n.ctx.NovaPractice.run(20, 3);
  assert.equal(n.say("how many are left?"), "Jon has 2 cookies left.");
  n.stop();
});

test("idle practice runs only when on, idle and not recently run; stop learning stops it", () => {
  const n = start();
  n.say("learn on your own");
  const P = n.ctx.NovaPractice;
  P.idleTick();
  assert.ok(!n.ctx.NovaSelf.entries().some((e) => e.kind === "practice"), "not idle yet");
  P._setLastInput(0); P.idleTick();
  assert.equal(n.ctx.NovaSelf.entries().filter((e) => e.kind === "practice").length, 1);
  P.idleTick();
  assert.equal(n.ctx.NovaSelf.entries().filter((e) => e.kind === "practice").length, 1, "at most every 30 minutes");
  n.say("stop learning");
  P._setLastInput(0); P._setLastRun(0); P.idleTick();
  assert.equal(n.ctx.NovaSelf.entries().filter((e) => e.kind === "practice").length, 1);
  assert.equal(n.say("why is the sky green"), "i do not know.");
  n.stop();
});
