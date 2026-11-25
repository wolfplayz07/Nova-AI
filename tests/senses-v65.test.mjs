/* v65: compound nouns ("What is a hospital bill?"), richer which-one picks,
   verb-meaning questions, and at most 3 senses then "more?". */
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
  "math-misses.js", "self-learn.js", "corrections.js", "same-as.js", "rules.js", "self.js"];
const start = (seed) => boot({ files: FILES, globals: { XMLHttpRequest: XHR }, seed });
const facts = (n) => JSON.parse(n.localStorage.getItem("nova-facts-v1") || "{}");
const senses = (n) => JSON.parse(n.localStorage.getItem("nova-senses-v1") || "{}");
const pending = (n) => JSON.parse(n.localStorage.getItem("nova-pending-teach-v1") || "null");
const HOSPITAL = /^a hospital bill is probably an itemized statement of money owed for goods shipped or services rendered for a hospital \(a health facility where patients receive treatment\)\. right\?$/;
const BILL_VERB = /demand payment/;

test("creator line: 'What is a hospital bill?' picks the money-owed sense, not the law sense", () => {
  const n = start();
  const out = n.say("What is a hospital bill?");
  assert.match(out, HOSPITAL, out);
  assert.doesNotMatch(out, /statute|law|i do not know/i);
  n.stop();
});

test("yes saves the phrase; no opens a teach slot; skip cancels", () => {
  let n = start();
  n.say("What is a hospital bill?");
  assert.match(n.say("yes"), /^saved\. hospital bill means an itemized statement of money owed/);
  assert.match(String(facts(n)["hospital bill"]?.user || facts(n)["hospital bill"] || ""), /money owed/);
  assert.equal(n.say("what is a hospital bill"), facts(n)["hospital bill"].user || facts(n)["hospital bill"]);
  n.stop();

  n = start();
  n.say("What is a hospital bill?");
  assert.equal(n.say("skip"), "ok. skipped.");
  assert.equal(facts(n)["hospital bill"], undefined);
  assert.match(n.say("What is a hospital bill?"), HOSPITAL);
  n.stop();

  n = start();
  n.say("What is a hospital bill?");
  assert.equal(n.say("no"), "ok. tell me what a hospital bill means if you like.");
  assert.equal(pending(n).term, "hospital bill");
  const taught = n.say("it means the amount you owe a hospital");
  assert.match(taught, /hospital bill|amount you owe/);
  assert.match(String((facts(n)["hospital bill"] && facts(n)["hospital bill"].user) || facts(n)["hospital bill"] || taught), /amount you owe/);
  n.stop();
});

test("a legal bill prefers the law sense; unknown phrases stay honest", () => {
  const n = start();
  assert.match(n.say("what is a legal bill?"), /statute in draft before it becomes law.*right\?$/);
  assert.match(n.say("what is a zorp wumpus?"), /^i do not know/);
  n.stop();
});

test("creator line: 'What does it mean when you bill someone' uses the verb sense", () => {
  const n = start();
  assert.match(n.say("What does it mean when you bill someone"), BILL_VERB);
  assert.match(n.say("what does it mean to bill"), BILL_VERB);
  assert.match(n.say("what is it to bill"), BILL_VERB);
  assert.match(n.say("what does bill mean"), BILL_VERB);
  n.stop();
});

test("which one? shows at most 3 senses then more?; more lists the rest", () => {
  const n = start();
  n.say("hello there");
  n.say("i like pizza a lot");
  const out = n.say("what is a bark");
  assert.match(out, /^dictionary says bark can mean: 1\) .* 2\) .* 3\) .*\. more\?$/, out);
  assert.doesNotMatch(out, /4\) /);
  const more = n.say("more");
  assert.match(more, /4\) /);
  assert.match(more, /which one\?$/);
  n.stop();
});

test("which one? accepts both, all, 1 and 2, 1,2, a number, and gloss text, and saves them", () => {
  const cases = [
    ["1", /saved\. bark means tough protective covering/],
    ["1,2", /saved\. bark can mean: 1\) .* 2\) /],
    ["1 and 2", /saved\. bark can mean: 1\) .* 2\) /],
    ["both", /saved\. bark can mean: 1\) .* 2\) /],
  ];
  for (const [pick, want] of cases) {
    const n = start();
    n.say("i like pizza a lot");
    n.say("what is a bark");
    const got = n.say(pick);
    assert.match(got, want, pick + " => " + got);
    assert.doesNotMatch(got, /3\) /, pick + " saved too many: " + got);
    assert.doesNotMatch(got, /i do not know/);
    n.stop();
  }
  {
    const n = start();
    n.say("i like pizza a lot");
    n.say("what is a bark");
    const got = n.say("all");
    assert.match(got, /saved\. bark can mean: 1\) /);
    assert.match(got, /3\) /);
    assert.doesNotMatch(got, /i do not know/);
    n.stop();
  }
  const n = start();
  n.say("i like pizza a lot");
  n.say("what is a bark");
  n.say("more");
  assert.match(n.say("the sailing ship"), /sailing ship/);
  n.stop();
});

test("a leftover line after which one? is not i do not know; skip still cancels", () => {
  const n = start();
  n.say("i like pizza a lot");
  n.say("what is a bark");
  const r = n.say("hmm");
  assert.doesNotMatch(r, /i do not know/);
  assert.match(r, /which one\?/);
  assert.equal(n.say("skip"), "ok. not saved.");
  n.stop();
});

test("restaurant bill and dental bill ask which bill, and a pick saves the phrase", () => {
  const n = start();
  const out = n.say("what is a restaurant bill?");
  assert.match(out, /^which bill\? 1\) .* 2\) .* 3\) .*\. more\?$/, out);
  assert.doesNotMatch(out, /is probably|i do not know/);
  const saved = n.say("2");
  assert.match(saved, /^saved\. restaurant bill means an itemized statement of money owed/);
  assert.match(String(facts(n)["restaurant bill"]?.user || ""), /money owed/);
  assert.doesNotMatch(n.say("what is a restaurant bill"), /which bill\?|is probably/);
  n.stop();

  const d = start();
  const dental = d.say("what is a dental bill?");
  assert.match(dental, /^which bill\? 1\) .* 2\) .* 3\) .*\. more\?$/, dental);
  assert.doesNotMatch(dental, /is probably|i do not know/);
  const more = d.say("more");
  assert.match(more, /^which bill\? 1\) /);
  assert.match(more, /4\) /);
  d.stop();
});

test("duck bill asks which and does not use a verb gloss of duck", () => {
  const n = start();
  const out = n.say("what is a duck bill?");
  assert.match(out, /^which bill\? 1\) .* 2\) .* 3\) .*\. more\?$/, out);
  assert.doesNotMatch(out, /is probably|i do not know/);
  assert.doesNotMatch(out, /move \(the head or body\)|quickly downwards|submerge or plunge|dip into a liquid|avoid or try to avoid/);
  n.stop();
});

test("articles use an before vowel sounds", () => {
  const n = start();
  const oak = n.say("what is an oak bark?");
  assert.match(oak, /^an oak bark is probably /);
  assert.match(oak, / for an oak \(/);
  assert.doesNotMatch(oak, /\ba oak\b|^a oak/);
  n.stop();

  const u = start();
  const util = u.say("what is a utility bill?");
  assert.match(util, /^a utility bill is probably /);
  assert.match(util, / for a utility \(/);
  assert.doesNotMatch(util, /\ban utility\b/);
  u.stop();

  const h = start();
  const hour = h.say("what is an hour clock?");
  assert.match(hour, /^an hour clock is probably /);
  assert.match(hour, / for an hour \(/);
  assert.doesNotMatch(hour, /\ba hour\b/);
  h.stop();

  const v = start();
  const uni = v.say("what is a university campus?");
  assert.match(uni, /^a university campus is probably /);
  assert.match(uni, / for a university \(/);
  assert.doesNotMatch(uni, /\ban university\b/);
  v.stop();
});
