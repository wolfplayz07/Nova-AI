/* v57: a word keeps several senses. Taught meanings are appended next to dictionary ones,
   and "a bark" / "bark" / "a piece of bark" pick the sense by wording + recent chat. */
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

test("dog chat -> 'what is a bark' is the taught dog sound", () => {
  const n = taughtLive();
  assert.equal(n.say("what is a bark"), DOG);
  assert.equal(n.say("What is a bark?"), DOG);
  n.stop();
});

test("fresh 'what is bark' is the tree covering", () => {
  const n = fresh(taughtLive());
  assert.match(n.say("what is bark"), TREE);
  n.stop();
});

test("'what is a piece of bark' / 'the bark of a tree' / 'tree bark' are the tree covering, even after dog chat", () => {
  const n = taughtLive();
  assert.match(n.say("what is a piece of bark"), TREE);
  assert.match(n.say("what is the bark of a tree"), TREE);
  assert.match(n.say("what is tree bark"), TREE);
  n.stop();
});

test("no context 'what is a bark' with both senses -> dog via the article cue", () => {
  const n = fresh(taughtLive());
  assert.equal(n.say("what is a bark"), DOG);
  n.stop();
});

test("close scores ask 'which one?'; 1/2/first/second or words pick; picking does not teach", () => {
  for (const [pick, want] of [["1", DOG], ["first", DOG], ["2", "a small sailing ship"], ["second", "a small sailing ship"], ["the boat one", "a small sailing ship"], ["the dog one", DOG]]) {
    let n = taughtLive();
    assert.equal(n.say("a bark is a small sailing ship"), "got it. bark is a small sailing ship.");
    n = fresh(n);
    const before = n.localStorage.getItem("nova-senses-v1");
    const factsBefore = n.localStorage.getItem("nova-facts-v1");
    assert.equal(n.say("what is a bark"), "which one? 1) a loud sound a dog makes 2) a small sailing ship");
    assert.equal(n.say(pick), want, pick);
    assert.equal(n.localStorage.getItem("nova-senses-v1"), before, "picking does not teach");
    assert.equal(n.localStorage.getItem("nova-facts-v1"), factsBefore);
    assert.ok(!n.lessons().some((l) => /which one/.test(l.nova)));
    n.stop();
  }
});

test("re-teaching the same meaning is a no-op; dictionary senses are still there after teaching", () => {
  const n = taughtLive();
  n.say("a bark is a loud sound a dog makes");
  n.say("A bark is a loud sound a dog makes.");
  const s = senses(n).bark;
  assert.equal(s.length, 1);
  assert.equal(s[0].source, "taught");
  assert.equal(s[0].kind, "count");
  assert.ok(s[0].cues.includes("dog"));
  const all = JSON.parse(JSON.stringify(n.ctx.NovaSenses.allSenses("bark")));
  assert.deepEqual(all.map((x) => x.source), ["taught", "dict", "dict"]);
  assert.match(all[1].gloss, /^tough protective covering/);
  n.stop();
});

test("migration: an old taught meaning in nova-facts-v1 becomes a sense, facts kept", () => {
  const facts = JSON.stringify({ bark: { user: DOG, locked: "" }, glorp: "a tiny blue frog", "my dog": { user: "rex", locked: "" } });
  const n = start({ "nova-facts-v1": facts });
  const s = senses(n);
  assert.equal(s.bark[0].gloss, DOG);
  assert.equal(s.glorp[0].gloss, "a tiny blue frog");
  assert.ok(!s["my dog"]);
  assert.equal(n.localStorage.getItem("nova-facts-v1"), facts);
  assert.match(n.say("what is bark"), TREE);
  assert.equal(n.say("what is a bark"), DOG);
  assert.equal(n.say("what is a glorp"), "a tiny blue frog");
  n.stop();
});

test("a locked meaning still always wins; words with one taught sense answer as before", () => {
  const n = start();
  n.say("lock bark as my dog's name");
  assert.equal(n.say("what is bark"), "my dog's name");
  assert.equal(n.say("a zibber is a moon rock"), "got it. zibber is a moon rock.");
  assert.equal(n.say("what is zibber"), "a moon rock");
  n.stop();
});
