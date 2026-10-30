/* v58: explicit wording always wins over recent chat context. */
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
const senses = (n) => JSON.parse(n.localStorage.getItem("nova-senses-v1") || "{}");
const DOG = "a loud sound a dog makes";
const TREE = /^dictionary says: bark \(noun\): tough protective covering/;

function taughtLive() { /* the creator's live transcript */
  const n = start();
  n.say("Can dogs talk?");
  n.say("no but they can bark or growl");
  n.say("What is a bark?");
  assert.equal(n.say("Actually a bark is a loud sound a dog makes"), "got it. bark means a loud sound a dog makes.");
  return n;
}
/* a new app session with the same saved data (fresh chat) */
function fresh(n) { const seed = Object.fromEntries([...["nova-facts-v1", "nova-senses-v1", "nova-senses-migrated-v1"]].map((k) => [k, n.localStorage.getItem(k)]).filter(([, v]) => v != null)); n.stop(); return start(seed); }


test("exact order: 'what is a bark' then 'what is bark' -> dog, then tree", () => {
  const n = fresh(taughtLive());
  assert.equal(n.say("What is a bark"), DOG);
  assert.match(n.say("What is bark"), TREE);
  n.stop();
});

test("reverse order: 'what is bark' then 'what is a bark' -> tree, then dog", () => {
  const n = fresh(taughtLive());
  assert.match(n.say("what is bark"), TREE);
  assert.equal(n.say("what is a bark"), DOG);
  n.stop();
});

test("dog chat then bare 'what is bark' -> tree (wording beats context)", () => {
  const n = taughtLive();
  n.say("my dog likes to run");
  assert.match(n.say("what is bark"), TREE);
  assert.match(n.say("what is bark?"), TREE);
  assert.equal(n.say("what is a bark"), DOG);
  n.stop();
});

test("no wording cue: 'what does it mean' after bark talk uses the chat, or asks", () => {
  let n = taughtLive();
  assert.equal(n.say("a bark is a small sailing ship"), "got it. bark is a small sailing ship.");
  n = fresh(n);
  n.say("my dog is loud");
  assert.equal(n.say("what is a bark"), DOG, "dog chat breaks the tie between two 'a bark' senses");
  assert.equal(n.say("what does it mean"), DOG);
  n.stop();
  n = fresh(taughtLive());
  n.say("what is bark");
  const out = n.say("what does it mean");
  assert.ok(out === DOG || TREE.test(out) || /^which one\? 1\) /.test(out), out);
  n.stop();
});

test("Nova's own answer text does not feed context for wording-cued lines", () => {
  let n = taughtLive();
  n.say("a bark is a small sailing ship");
  n = fresh(n);
  n.say("what is a piece of bark"); /* Nova answers with tree words */
  assert.equal(n.say("what is a bark"), "which one? 1) a loud sound a dog makes 2) a small sailing ship");
  n.stop();
});
