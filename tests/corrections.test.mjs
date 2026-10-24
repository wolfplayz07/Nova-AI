/* v51 correction tracking: corrected guesses are never repeated; only ever more careful. */
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
const BASE = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js", "math-misses.js", "self-learn.js"];
const start = (files = [...BASE, "corrections.js"], seed) => boot({ files, globals: { XMLHttpRequest: XHR }, seed });
const stub = (n, fn) => { n.T().generate = fn; };
const conf = (n) => JSON.parse(n.localStorage.getItem("nova-confidence-v1") || '{"q":{},"bad":[]}');

test("off by default: same replies as without corrections.js, nothing counted", () => {
  const a = start(BASE), b = start();
  for (const n of [a, b]) stub(n, () => "the cat sat on the mat");
  const lines = ["why is the sky green", "no, because of light", "nice weather today", "hello", "fix hi there", "hello", "what is a zorp", "skip"];
  for (const l of lines) assert.equal(b.say(l), a.say(l), l);
  assert.deepEqual(conf(b), { q: {}, bad: [] });
  a.stop(); b.stop();
});

test("a corrected guess is counted, journaled, and never said again", () => {
  const n = start();
  n.say("learn on your own");
  n.say("don't ask me words");
  stub(n, () => "the cat sat on the mat");
  assert.equal(n.say("why is the sky green"), "the cat sat on the mat");
  assert.equal(n.say("no, because of light"), "lesson saved.");
  assert.equal(n.say("why is the sky green"), "because of light", "the lesson answers");
  assert.equal(n.say("nice weather today"), "i do not know.", "the wrong guess is not repeated anywhere");
  n.say("skip");
  assert.equal(conf(n).q["why is the sky green"].generate, 1);
  assert.match(n.say("what did you learn on your own"), /you corrected my answer to "why is the sky green" \(a guess: "the cat sat on the mat"\); i will not guess that again/);
  assert.equal(n.say("what are you unsure about"), "you corrected me on: \"why is the sky green\".");
  stub(n, () => "the mat sat on the cat");
  assert.equal(n.say("nice weather today"), "the mat sat on the cat", "other guesses still allowed");
  n.stop();
});

test("lessons corrected are counted (the lesson itself is replaced as before)", () => {
  const n = start();
  n.say("learn on your own");
  n.say("when i say who is ada say a friend");
  assert.equal(n.say("who is ada"), "a friend");
  assert.equal(n.say("fix my sister"), "lesson saved.");
  assert.equal(n.say("who is ada"), "my sister");
  assert.match(n.say("what are you unsure about"), /"who is ada"/);
  assert.equal(conf(n).bad.length, 0, "only guesses go on the never-again list");
  n.stop();
});

test("two corrected guesses for one question: no more guessing there, only i do not know", () => {
  const n = start();
  n.say("learn on your own");
  let k = 0;
  stub(n, () => ["the cat sat", "the mat sat on the cat", "the cat is on the mat"][k++ % 3]);
  assert.equal(n.say("why is the sky green"), "the cat sat");
  n.say("no, light");
  n.T().setLessons([]);
  assert.equal(n.say("why is the sky green"), "the mat sat on the cat");
  n.say("no, light");
  n.T().setLessons([]);
  assert.equal(n.say("why is the sky green"), "i do not know.");
  assert.equal(n.say("what are you unsure about"), "you corrected me on: \"why is the sky green\" (2 times).");
  n.stop();
});

test("stop learning: no new counts, but old careful rules still apply; i do not know stays honest", () => {
  const n = start();
  n.say("learn on your own");
  stub(n, () => "the cat sat on the mat");
  n.say("why is the sky green"); n.say("no, because of light");
  n.say("stop learning");
  stub(n, () => "a big dog");
  n.say("why is grass blue"); n.say("no, it is not");
  assert.equal(Object.keys(conf(n).q).length, 1);
  stub(n, () => "the cat sat on the mat");
  assert.equal(n.say("why do birds sing"), "i do not know.");
  assert.equal(n.say("clear corrections"), "ok. correction notes cleared.");
  assert.equal(n.say("what are you unsure about"), "nothing yet. you have not corrected me.");
  n.stop();
});

test("teaching after i do not know is not a correction", () => {
  const n = start();
  n.say("learn on your own");
  assert.equal(n.say("why is the sky green"), "i do not know.");
  n.say("because of light");
  assert.equal(n.say("what are you unsure about"), "nothing yet. you have not corrected me.");
  n.stop();
});
