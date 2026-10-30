/* v56: dictionary sense picked from the recent chat, "which one?" for ties, "no" to remember-it
   opens a teach slot, any other reply (or "actually ...") is the creator's own meaning,
   "a X is Y" teaches X, and word-salad guesses are rejected and never become lessons. */
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
const FILES = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js", "math-misses.js",
  "self-learn.js", "corrections.js", "same-as.js"];
const start = (seed) => boot({ files: FILES, globals: { XMLHttpRequest: XHR }, seed });
const facts = (n) => JSON.parse(n.localStorage.getItem("nova-facts-v1") || "{}");
const pending = (n) => JSON.parse(n.localStorage.getItem("nova-pending-teach-v1") || "null");
const SALAD = "you what is you learn my phrases and so";
const BARK_DOG = "dictionary says: bark (verb): speak in an unfriendly tone. want me to remember it?";

test("after dog talk, 'What is a bark?' gives the dog sense, not tree bark", () => {
  const n = start();
  assert.equal(n.say("Can dogs talk?"), "yes or no?");
  n.say("no but they can bark or growl");
  assert.equal(n.say("What is a bark?"), BARK_DOG);
  n.stop();
});

test("tree talk picks the tree sense", () => {
  const n = start();
  n.say("the oak tree has big roots");
  assert.match(n.say("what is bark"), /^dictionary says: bark \(noun\): tough protective covering/);
  n.stop();
});

test("context that does not decide: list two senses, pick with 1/2/first/second, what else still works", () => {
  for (const [pick, want] of [["1", /\(noun\): tough/], ["first", /\(noun\): tough/], ["2", /\(verb\): speak/], ["second", /\(verb\): speak/]]) {
    const n = start();
    n.say("hello there");
    n.say("i like pizza a lot");
    const r = n.say("what is a bark");
    assert.equal(r, "dictionary says bark can mean: 1) (noun) tough protective covering of the woody stems and roots of trees and other woody plants 2) (verb) speak in an unfriendly tone. which one?");
    const got = n.say(pick);
    assert.match(got, want);
    assert.match(got, /want me to remember it\?$/);
    assert.match(n.say("yes"), /^saved\. bark means /);
    n.stop();
  }
  const n = start();
  n.say("i like pizza a lot");
  n.say("what is a bark");
  assert.equal(n.say("what else"), "those are the only meanings i have from the dictionary. say 1 or 2.");
  assert.equal(n.say("yes"), "which one? say 1 or 2.");
  assert.match(n.say("2"), /speak in an unfriendly tone/);
  assert.equal(n.say("what else"), "dictionary also says: bark (noun): tough protective covering of the woody stems and roots of trees and other woody plants. want me to remember it?");
  n.stop();
});

test("fresh chat keeps plain first sense (no 'which one?')", () => {
  const n = start();
  assert.match(n.say("what is a bark"), /^dictionary says: bark \(noun\)/);
  n.stop();
});

test("live transcript 1: no -> 'a bark is a loud sound a dog makes' saves bark, salad never spoken or learned", () => {
  const n = start();
  n.T().generate = () => SALAD;
  n.say("Can dogs talk?");
  n.say("no but they can bark or growl");
  assert.equal(n.say("What is a bark?"), BARK_DOG);
  assert.equal(n.say("No"), "ok. not saved. tell me what bark means if you like.");
  assert.equal(pending(n).term, "bark");
  const r = n.say("a bark is a loud sound a dog makes");
  assert.notEqual(r, SALAD);
  assert.equal(r, "saved your meaning of bark.");
  assert.equal(facts(n).bark.user, "a loud sound a dog makes");
  assert.equal(n.say("what is a bark"), "a loud sound a dog makes");
  assert.ok(!n.lessons().some((l) => l.nova === SALAD), "salad never a lesson");
  n.stop();
});

test("live transcript 2: 'Actually a bark is a loud sound a dog makes' right after the dictionary answer", () => {
  const n = start();
  n.T().generate = () => SALAD;
  n.say("Can dogs talk?");
  n.say("no but they can bark or growl");
  n.say("What is a bark?");
  assert.equal(n.say("Actually a bark is a loud sound a dog makes"), "got it. bark means a loud sound a dog makes.");
  assert.equal(facts(n).bark.user, "a loud sound a dog makes");
  n.stop();
});

test("other replies to remember-it: 'no, ...' and a plain meaning save; questions and commands do not", () => {
  let n = start();
  n.say("what is a river");
  assert.equal(n.say("no, the creek behind my house"), "got it. river means the creek behind my house.");
  n.stop();
  n = start();
  n.say("what is a river");
  assert.equal(n.say("water you can swim in"), "got it. river means water you can swim in.");
  n.stop();
  n = start();
  n.say("what is a river");
  n.say("what is a lake?");
  assert.ok(!facts(n).river, "a new question is not a meaning");
  n.stop();
  n = start();
  n.say("what is a river");
  n.say("brain status");
  assert.ok(!facts(n).river, "an owner command is not a meaning");
  n.stop();
});

test("skip after the dictionary still just drops it", () => {
  const n = start();
  n.say("what is a river");
  assert.equal(n.say("skip"), "ok. not saved.");
  assert.equal(pending(n), null);
  n.stop();
});

test("auto-words (v50) 'no' opens a teach slot; next line saves; skip does not", () => {
  const twice = (n) => { n.say("the reactor hums"); n.say("skip"); n.say("the reactor glows"); n.say("skip"); };
  let n = start();
  n.say("learn on your own");
  twice(n);
  assert.match(n.say("how are you"), /want me to remember it\? \(skip is fine\)$/);
  assert.equal(n.say("no"), "ok. not saved. tell me what reactor means if you like.");
  assert.equal(n.say("the machine in my garage"), "saved your meaning of reactor.");
  assert.equal(facts(n).reactor.user, "the machine in my garage");
  n.stop();
  n = start();
  n.say("learn on your own");
  twice(n);
  n.say("how are you");
  assert.equal(n.say("skip"), "ok. not saved.");
  assert.equal(pending(n), null);
  assert.ok(!facts(n).reactor);
  n.stop();
});

test("'a X is Y' / 'an X is Y' / 'X is Y' teach X; questions, people and math do not", () => {
  const n = start();
  assert.equal(n.say("a glorp is a tiny blue frog"), "got it. glorp is a tiny blue frog.");
  assert.equal(n.say("what is a glorp"), "a tiny blue frog");
  assert.equal(n.say("an zib is a moon rock"), "got it. zib is a moon rock.");
  assert.equal(n.say("fleeb is a kind of dance"), "got it. fleeb is a kind of dance.");
  n.say("it is a nice day");
  n.say("my dog is very fast");
  n.say("2 plus 2 is 4");
  const f = facts(n);
  assert.ok(!f.it && !f["my dog"] && !f["2 plus 2"]);
  n.stop();
});

test("the live gibberish string is rejected by the guess gate and becomes i do not know + teach", () => {
  const n = start();
  const T = n.T();
  assert.equal(T.acceptGenerated(SALAD, "what is your favorite phrase"), false);
  assert.equal(T.acceptGenerated(SALAD), false);
  assert.equal(T.wordSalad(SALAD), true);
  assert.equal(T.acceptGenerated("the cat sat on the mat", "why is the sky green"), true, "plain sentences still pass");
  T.generate = () => SALAD;
  assert.equal(n.say("tell me something about frogs"), "i do not know.");
  assert.ok(pending(n), "pending teach opened");
  n.stop();
});

test("rejected or guessed lines are never written to lessons", () => {
  const n = start();
  n.say("start learning");
  const T = n.T();
  assert.equal(T.learnPair("hi", SALAD), false);
  T.generate = () => SALAD;
  n.say("tell me something about frogs");
  T.generate = () => "the cat sat on the mat";
  assert.equal(n.say("why is the sky green"), "the cat sat on the mat");
  const L = n.lessons();
  assert.ok(!L.some((l) => l.nova === SALAD), "salad not learned");
  assert.ok(!L.some((l) => l.nova === "the cat sat on the mat"), "an unconfirmed guess is not a lesson");
  n.stop();
});
