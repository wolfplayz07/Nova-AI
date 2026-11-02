/* v59: the sense comes from HOW the word is used in the creator's sentence. */
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
const FILES = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js", "senses.js",
  "math-misses.js", "self-learn.js", "corrections.js", "same-as.js"];
const start = (seed) => boot({ files: FILES, globals: { XMLHttpRequest: XHR }, seed });

const BASEBALL = /^dictionary says: single \(noun\): a base hit/;
const UNMARRIED = /^dictionary says: single \(adjective\): not married/;
const SONG = /^dictionary says: single \(noun\): a recording of one song/;
const JUSTONE = /^dictionary says: single \(adjective\): existing alone or consisting of one entity/;

for (const [line, want] of [
  ["he hit a single", BASEBALL],
  ["she is single", UNMARRIED],
  ["their new single", SONG],
  ["a single apple", JUSTONE],
  ["are you married or single", UNMARRIED],
  ["i ate a single apple today", JUSTONE],
]) {
  test(`'what does single mean in ${line}'`, () => {
    const n = start();
    const out = n.say(`what does single mean in ${line}`);
    assert.match(out, want, out);
    assert.match(out, /want me to remember it\?$/);
    n.stop();
  });
  if (line.startsWith("are ")) continue; /* a question line is not a usage sentence */
  test(`'${line}' then 'what does single mean' uses that sentence`, () => {
    const n = start();
    n.say(line);
    const out = n.say("what does single mean");
    assert.match(out, want, out);
    n.stop();
  });
}

test("'what is single' right after the sentence also uses it", () => {
  const n = start();
  n.say("she is single");
  assert.match(n.say("what is single"), UNMARRIED);
  n.stop();
});

test("verb forms: 'the batter singled' -> the verb sense", () => {
  const n = start();
  assert.match(n.say("what does single mean in the batter singled to left"), /^dictionary says: single \(verb\): hit a single/);
  n.stop();
});

test("the full dictionary list is there now (not cut at 2)", () => {
  const n = start();
  const e = n.ctx.NovaDict.entry("single");
  assert.ok(e.senses.length >= 8, String(e.senses.length));
  assert.equal(e.senses[0][1], "a base hit on which the batter stops safely at first base");
  n.stop();
});

test("no clue at all: 'which one?' lists every meaning, and a number past 2 picks", () => {
  const n = start();
  const out = n.say("what does single mean in single");
  assert.match(out, /^dictionary says single can mean: 1\) .* 2\) .* 3\) .* 8\) .* which one\?$/, out);
  const got = n.say("7");
  assert.match(got, /^dictionary says: single \(adjective\): not married/);
  assert.match(n.say("no thanks"), /not saved/);
  n.stop();
});

test("picking 'third one' works on a long list", () => {
  const n = start();
  n.say("what does single mean in single");
  assert.match(n.say("the third one"), /^dictionary says: single \(noun\): the smallest whole number/);
  n.stop();
});

test("generic, not per-word: other words follow their usage too", () => {
  const n = start();
  assert.match(n.say("what does light mean in this bag is light"), /^dictionary says: light \(adjective\)/);
  assert.match(n.say("what does run mean in we run every day"), /^dictionary says: run \(verb\)/);
  assert.match(n.say("what does run mean in he scored a run"), /^dictionary says: run \(noun\): a score in baseball/);
  n.stop();
});

test("v58 kept: question wording beats the chat sentence for bark", () => {
  const n = start();
  n.say("the dogs bark at night");
  assert.match(n.say("what is a piece of bark"), /^dictionary says: bark \(noun\): tough protective covering/);
  n.stop();
});

test("a usage sentence never teaches and never saves on its own", () => {
  const n = start();
  n.say("she is single");
  n.say("what does single mean");
  const facts = JSON.parse(n.localStorage.getItem("nova-facts-v1") || "{}");
  assert.equal(facts.single, undefined);
  assert.match(n.say("yes"), /^saved\. single means not married/);
  n.stop();
});

test("unknown words still say i do not know", () => {
  const n = start();
  assert.equal(n.say("what does zorblax mean in the zorblax is here"), "i do not know.");
  n.stop();
});

test("verb and adverb usage: 'the dogs bark at night', 'she runs fast'", () => {
  const n = start();
  n.say("the dogs bark at night");
  assert.match(n.say("what does bark mean"), /^dictionary says: bark \(verb\): make barking sounds/);
  assert.match(n.say("what does fast mean in she runs fast"), /^dictionary says: fast \(adverb\): quickly/);
  n.stop();
});
