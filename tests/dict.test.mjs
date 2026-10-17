/* v44 offline dictionary: WordNet shards in web/dict, "dictionary says: ..." replies,
   yes saves a user fact, no/skip does not, facts win, stop learning means no save offer. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot } from "./harness.mjs";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const DICT = path.join(WEB, "dict");
let requests = 0;
/* Same-origin sync XHR, served from the files on disk. */
class XHR {
  open(method, url, async) { this.url = url; this.async = async; }
  send() {
    requests++;
    const p = path.join(WEB, this.url.split("?")[0]);
    if (this.async !== false) throw new Error("dict.js must use a synchronous request");
    if (fs.existsSync(p)) { this.status = 200; this.responseText = fs.readFileSync(p, "utf8"); }
    else { this.status = 404; this.responseText = ""; }
  }
}
const FILES = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js"];
const start = (seed) => boot({ files: FILES, globals: { XMLHttpRequest: XHR }, seed });
const facts = (n) => JSON.parse(n.localStorage.getItem("nova-facts-v1") || "{}");
const RIVER = "dictionary says: river (noun): a large natural stream of water (larger than a creek). want me to remember it?";

test("what is X with no fact: dictionary says ..., yes saves it as a user fact", () => {
  const n = start();
  assert.equal(n.say("what is a river"), RIVER);
  assert.match(n.say("yes"), /^saved\. river means a large natural stream of water/);
  assert.match(facts(n).river.user, /^a large natural stream of water/);
  assert.equal(facts(n).river.locked, "");
  assert.match(n.say("what is a river"), /^a large natural stream of water/, "now it is the creator's saved meaning");
  n.stop();
});

test("no and skip do not save", () => {
  for (const ans of ["no", "skip", "nope"]) {
    const n = start();
    assert.match(n.say("define river"), /^dictionary says: river \(noun\)/);
    assert.equal(n.say(ans), "ok. not saved.");
    assert.ok(!facts(n).river, ans + " must not save");
    assert.equal(n.localStorage.getItem("nova-pending-teach-v1"), null, "no teach left pending");
    n.stop();
  }
});

test("every lookup phrasing reaches the dictionary", () => {
  const n = start();
  for (const q of ["what is a river", "what's a river?", "what does river mean", "define river", "look up river",
    "what is the meaning of river", "meaning of river"]) {
    assert.equal(n.say(q), RIVER, q);
    n.say("no");
  }
  assert.match(n.say("what is cats"), /^dictionary says: cat \(noun\)/, "plural");
  n.say("no");
  assert.match(n.say("what is mice"), /^dictionary says: mouse \(noun\)/, "irregular plural");
  n.say("no");
  n.stop();
});

test("locked and user facts always win over the dictionary", () => {
  const n = start();
  n.say("lock river as the road by my house");
  assert.equal(n.say("what is a river"), "the road by my house");
  n.say("cat means my best friend");
  assert.equal(n.say("what is a cat"), "my best friend");
  n.stop();
});

test("no dictionary entry keeps the approved what-is + Skip prompt", () => {
  const n = start();
  assert.equal(n.say("what is a zorp"), "i do not know zorp. what do you mean by it?");
  assert.equal(n.say("skip"), "ok. skipped.");
  n.stop();
});

test("dictionary missing (no shards / offline) falls back to the what-is prompt", () => {
  const n = boot({ files: FILES });
  assert.equal(n.say("what is a river"), "i do not know river. what do you mean by it?");
  n.say("skip");
  n.stop();
});

test("math still answers first; other meaning on request", () => {
  const n = start();
  assert.equal(n.say("what is 25% of 200"), "50.");
  assert.match(n.say("what is a bank"), /^dictionary says: bank \(noun\): sloping land/);
  assert.equal(n.say("what else"), "dictionary also says: bank (verb): tip laterally. want me to remember it?");
  assert.match(n.say("yes"), /^saved\. bank means tip laterally/);
  n.stop();
});

test("stop learning: still looks words up but does not offer or save", () => {
  const n = start();
  n.say("stop learning");
  const r = n.say("what is a river");
  assert.match(r, /^dictionary says: river \(noun\): .* learning is stopped, so i will not save it\.$/);
  n.say("yes");
  assert.ok(!facts(n).river, "nothing saved while learning is stopped");
  n.say("start learning");
  assert.equal(n.say("what is a river"), RIVER);
  n.say("no");
  n.stop();
});

test("dictionary replies are never saved as lessons while learning is on", () => {
  const n = start();
  n.say("start learning");
  n.say("what is a river");
  n.say("no");
  n.say("what is a bank");
  n.say("yes");
  assert.ok(!n.lessons().some((l) => /dictionary|not saved|^saved/.test(l.nova)), JSON.stringify(n.lessons()));
  n.stop();
});

test("new-word index: 'teach me new words' offers the dictionary meaning", () => {
  const n = start();
  const idx = () => JSON.parse(n.localStorage.getItem("nova-new-words-v1") || '{"words":{}}').words;
  n.say("my arc reactor is glowing");
  n.say("skip");
  n.say("the reactor needs power");
  n.say("skip");
  assert.equal(idx().reactor.count, 2);
  assert.match(n.say("teach me new words"), /^you have said "reactor" 2 times\. dictionary says: reactor \(noun\): .*want me to remember it\?$/);
  assert.match(n.say("yes"), /^saved\. reactor means /);
  assert.ok(facts(n).reactor.user);
  assert.ok(!("reactor" in idx()), "a saved word leaves the new-word list");
  n.stop();
});

test("new-word index: words not in the dictionary keep the v43 ask", () => {
  const n = start();
  n.say("the zorpix is loud");
  n.say("skip");
  assert.equal(n.say("ask me a word"), 'you have said "zorpix" 1 time. what does zorpix mean?');
  assert.ok(!/^i do not know/.test(n.say("a loud robot")));
  assert.equal(n.say("what is zorpix"), "a loud robot");
  n.stop();
});

test("shards are lazy: one lookup loads only its own shard", () => {
  requests = 0;
  const n = start();
  assert.equal(requests, 0, "nothing loaded at boot");
  n.say("what is a river");
  assert.equal(requests, 1);
  n.say("no");
  n.say("what is a river");
  assert.equal(requests, 1, "shard kept in memory");
  n.say("no");
  n.stop();
});

test("dictionary files: sharded, small, licensed", () => {
  const files = fs.readdirSync(DICT).filter((f) => f.endsWith(".json"));
  const ix = JSON.parse(fs.readFileSync(path.join(DICT, "index.json"), "utf8"));
  assert.equal(ix.shards.length, files.length - 1);
  let total = 0;
  for (const f of files) {
    const size = fs.statSync(path.join(DICT, f)).size;
    total += size;
    assert.ok(size < 2 * 1024 * 1024, f + " is too big");
  }
  assert.ok(total < 30 * 1024 * 1024, "total " + total);
  assert.ok(ix.words > 100000);
  const lic = fs.readFileSync(path.join(DICT, "LICENSE-WordNet.txt"), "utf8");
  assert.match(lic, /WordNet 3\.0 Copyright 2006 by Princeton University/);
  const ri = JSON.parse(fs.readFileSync(path.join(DICT, "ri.json"), "utf8"));
  assert.ok(ri.river.length >= 1 && ri.river.length <= 2 && ri.river[0][0] === "n");
});
