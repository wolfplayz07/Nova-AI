/* v62: before "yes or no?", Nova asks about words in a yes/no question it does not know or cannot
   tell apart (at most 2), saves the creator's answer as that word's meaning, then asks "yes or no?".
   Also: "remember yes is I want to" teaches a yes meaning; "what do you remember" lists taught senses. */
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
const yn = (n) => JSON.parse(n.localStorage.getItem("nova-yesno-v1") || "{}");
const senses = (n) => JSON.parse(n.localStorage.getItem("nova-senses-v1") || "{}");
const glosses = (n, w) => (senses(n)[w] || []).map((s) => s.gloss);

test("unknown noun is asked about first: what is a glorp?", () => {
  const n = start();
  assert.equal(n.say("Do glorps blorf?"), "what is a glorp?");
  n.stop();
});

test("answers are saved as taught meanings, the verb is asked next, then yes or no", () => {
  const n = start();
  n.say("Do glorps blorf?");
  assert.equal(n.say("a glorp is a tiny robot"), "saved your meaning of glorp. what does blorf mean?");
  assert.equal(n.say("it means to hop"), "saved your meaning of blorf. do glorps blorf? yes or no?");
  assert.deepEqual(glosses(n, "glorp"), ["a tiny robot"]);
  assert.deepEqual(glosses(n, "blorf"), ["to hop"]);
  assert.equal(n.say("yes"), "got it. next time i'll say: yes");
  assert.equal(n.say("Do glorps blorf?"), "yes");
  n.stop();
});

test("'<word> means X' answers the open word too", () => {
  const n = start();
  n.say("Do glorps blorf?");
  n.say("glorp means a tiny robot");
  assert.match(n.say("blorf means to hop"), /saved your meaning of blorf\. do glorps blorf\? yes or no\?/);
  n.stop();
});

test("a known word is never asked about again (taught first)", () => {
  const n = start();
  n.say("remember glorp means a tiny robot");
  assert.equal(n.say("Do glorps blorf?"), "what does blorf mean?");
  n.stop();
});

test("taught meanings stack (v60 add-to-list), never replace", () => {
  const n = start();
  n.say("a glorp is a tiny robot");
  n.say("can glorps fly?");
  assert.deepEqual(glosses(n, "glorp"), ["a tiny robot"]);
  n.say("do blorfs glorp?");
  n.say("a blorf is a soft hat");
  n.say("glorp means to spin");
  assert.deepEqual(glosses(n, "glorp"), ["a tiny robot", "to spin"]);
  n.stop();
});

test("several meanings with no clear winner: which call? 1) ... 2) ...; a number picks one", () => {
  const n = start();
  const ask = n.say("Do phones call?");
  assert.match(ask, /^which call\? 1\) .+ 2\) /);
  assert.match(n.say("1"), /^ok, call = get or try to get into communication.*do phones call\? yes or no\?$/);
  assert.deepEqual(glosses(n, "call"), [], "picking a dictionary meaning teaches nothing");
  n.stop();
});

test("skip / nevermind cancels the questions", () => {
  for (const c of ["skip", "nevermind"]) {
    const n = start();
    n.say("Do glorps blorf?");
    assert.equal(n.say(c), "ok. skipped.");
    assert.deepEqual(senses(n), {});
    assert.equal(n.ctx.NovaLookup.readClarify(), null);
    n.stop();
  }
});

test("at most 2 words per question", () => {
  const n = start();
  assert.equal(n.say("Do glorps blorf zorbles?"), "what is a glorp?");
  assert.equal(n.say("a tiny robot"), "saved your meaning of glorp. what does blorf mean?");
  assert.equal(n.say("to hop"), "saved your meaning of blorf. do glorps blorf zorbles? yes or no?");
  assert.deepEqual(glosses(n, "zorble"), []);
  n.stop();
});

test("a new question instead of an answer drops the open word", () => {
  const n = start();
  n.say("Do glorps blorf?");
  assert.equal(n.say("Can dogs bark"), "yes or no?");
  assert.deepEqual(senses(n), {});
  n.stop();
});

test("every word known: behaves as before", () => {
  const n = start();
  for (const q of ["Can dogs bark", "can a dog talk?", "do fish swim?", "is fire hot?"]) assert.equal(n.say(q), "yes or no?", q);
  n.say("when i say is the sky blue say yes");
  assert.equal(n.say("Is the sky blue?"), "yes");
  n.stop();
});

test("without the dictionary nothing is asked (offline stays honest yes or no)", () => {
  const n = boot({ files: ["train.js", "lookup.js", "app.js"] });
  assert.equal(n.say("Do glorps blorf?"), "yes or no?");
  n.stop();
});

test("what-is still works and i do not know stays honest", () => {
  const n = start();
  assert.match(n.say("what is a glorp"), /i do not know glorp/);
  n.stop();
});

test("bug a: 'Remember yes is I want to' saves the meaning 'I want to'", () => {
  const n = start();
  assert.equal(n.say("Remember yes is I want to"), 'Got it. "yes" means "I want to".');
  assert.deepEqual(yn(n).yes, ["i want to"]);
  assert.match(n.say("what do you remember"), /yes: I want to/);
  n.stop();
});

test("bug a: 'remember no is I don't want to' and plain remember still work", () => {
  const n = start();
  n.say("remember no is I don't want to");
  assert.deepEqual(yn(n).no, ["i don't want to"]);
  assert.equal(n.say("remember my name is Sam"), 'Got it. Saved "name" on this phone.');
  n.stop();
});

test("bug b: what do you remember lists every taught sense", () => {
  const n = start();
  n.say("remember glorp means a game");
  n.say("a blick is a small bird");
  n.say("Do zorbs blorf?");
  n.say("a zorb is a round ball");
  n.say("to hop");
  n.say("remember glorp means a tiny robot");
  n.say("remember my name is Sam");
  const out = n.say("what do you remember");
  assert.match(out, /- glorp: a game; a tiny robot/);
  assert.match(out, /- blick: a small bird/);
  assert.match(out, /- zorb: a round ball/);
  assert.match(out, /- blorf: to hop/);
  assert.match(out, /- name: Sam/);
  n.stop();
});
