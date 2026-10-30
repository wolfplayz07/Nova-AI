/* v54 reasoning fallback: a guess from generate() can be corrected with
   "the answer is X", "you should say X", "wrong, X", or "actually, X" on the very next line. */
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
const FILES = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js", "math-misses.js", "self-learn.js", "corrections.js", "same-as.js"];
const start = () => boot({ files: FILES, globals: { XMLHttpRequest: XHR } });
const stub = (n, fn) => { n.T().generate = fn; };
const conf = (n) => JSON.parse(n.localStorage.getItem("nova-confidence-v1") || '{"q":{},"bad":[]}');

for (const [fix, want] of [["the answer is blue light", "blue light"], ["you should say blue light", "blue light"], ["wrong, blue light", "blue light"], ["actually, blue light", "blue light"]]) {
  test(`guess corrected by "${fix}" teaches the question`, () => {
    const n = boot();
    stub(n, () => "the cat sat on the mat");
    assert.equal(n.say("why is the sky green"), "the cat sat on the mat");
    assert.equal(n.say(fix), "got it. next time i'll say: " + want);
    assert.equal(n.say("why is the sky green"), want);
    n.stop();
  });
}

test("correction only applies to the line right after a guess", () => {
  const n = boot();
  stub(n, () => "the cat sat on the mat");
  n.say("why is the sky green");
  assert.equal(n.say("what is 2 plus 2"), "4.");
  n.say("the answer is blue light");
  assert.ok(!n.lessons().some((l) => l.user === "why is the sky green"));
  n.stop();
});

test("no guess, no correction: IDK path unchanged", () => {
  const n = boot();
  stub(n, () => "tzz52");
  assert.equal(n.say("why is the sky green"), "i do not know.");
  assert.equal(n.say("the answer is blue light"), "got it. next time i'll say: blue light");
  assert.equal(n.say("why is the sky green"), "blue light");
  n.stop();
});

test("a new question after a guess is not saved as the correction", () => {
  const n = boot();
  stub(n, () => "the cat sat on the mat");
  n.say("why is the sky green");
  n.say("actually, why is grass green?");
  assert.ok(!n.lessons().some((l) => l.user === "why is the sky green"));
  n.stop();
});

test("corrected guess is tracked by v51 and stays blocked", () => {
  const n = start();
  n.say("learn on your own");
  n.say("don't ask me words");
  stub(n, () => "the cat sat on the mat");
  assert.equal(n.say("why is the sky green"), "the cat sat on the mat");
  assert.equal(n.say("the answer is blue light"), "got it. next time i'll say: blue light");
  assert.ok(conf(n).bad.includes("the cat sat on the mat"));
  assert.equal(n.say("why is the sky green"), "blue light");
  assert.equal(n.say("nice weather today"), "i do not know.", "blocked guess is not said again");
  n.stop();
});

test("yes or no and what-is flows are unchanged", () => {
  const n = boot();
  stub(n, () => "the cat sat on the mat");
  assert.equal(n.say("can you swim"), "yes or no?");
  assert.equal(n.say("no"), "got it. next time i'll say: no");
  assert.equal(n.say("what is a zorp"), "i do not know zorp. what do you mean by it?");
  assert.equal(n.say("skip"), "ok. skipped.");
  n.stop();
});
