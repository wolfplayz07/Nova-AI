/* v43 new-word index: unknown words are kept as building blocks; replies never change. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

/* After "i do not know." the next line is taken as a correction (a lesson), which makes its
   words known by design. say2 answers "skip" so each line stays a plain statement. */
const say2 = (n, l) => { const r = n.say(l); if (/^i do not know|^yes or no/.test(r)) n.say("skip"); return r; };
const idx = (n) => JSON.parse(n.localStorage.getItem("nova-new-words-v1") || '{"words":{}}').words;

test("unknown words are indexed with count, times and examples", () => {
  const n = boot();
  say2(n, "my arc reactor is glowing");
  say2(n, "the reactor needs power");
  say2(n, "the reactor needs power");
  const w = idx(n);
  assert.equal(w.reactor.count, 3);
  assert.deepEqual(w.reactor.examples, ["my arc reactor is glowing", "the reactor needs power"]);
  assert.ok(w.reactor.firstSeen <= w.reactor.lastSeen);
  say2(n, "x".repeat(200) + " reactor");
  say2(n, "reactor a"); say2(n, "reactor b");
  assert.equal(idx(n).reactor.examples.length, 3, "max 3 examples");
  assert.ok(idx(n).reactor.examples.every((e) => e.length <= 120));
  n.stop();
});

test("known, stop, number, URL, long and command words are not indexed", () => {
  const n = boot();
  n.say("the 42 four twenty https://example.com/zorpx www.blarg.com is q " + "z".repeat(25));
  n.say("lock pause sample");
  say2(n, "hello how are you");
  const w = idx(n);
  for (const k of ["the", "four", "twenty", "zorpx", "blarg", "example", "q", "is", "lock", "pause", "sample", "hello", "you"]) {
    assert.ok(!(k in w), k + " should not be indexed");
  }
  assert.equal(Object.keys(w).filter((k) => k.length > 24).length, 0);
  n.stop();
});

test("skip/cancel lines are not indexed", () => {
  const n = boot();
  n.say("skip"); n.say("never mind");
  assert.deepEqual(idx(n), {});
  n.stop();
});

test("list command shows top words by count", () => {
  const n = boot();
  assert.equal(n.say("new words"), "no new words yet.");
  say2(n, "my arc reactor is glowing"); say2(n, "the reactor needs power"); say2(n, "zorp is fun"); say2(n, "zorp again");
  const out = n.say("what words don't you know?");
  assert.match(out, /^words i do not know yet: reactor \(2\), zorp \(2\)/);
  assert.match(out, /arc \(1\)/);
  assert.equal(n.say("new words"), out.replace(/\s+$/, ""), "both phrasings work, list itself not indexed");
  n.stop();
});

test("ask command arms teach flow; answer makes word known and removes it", () => {
  const n = boot();
  say2(n, "my arc reactor is glowing"); say2(n, "the reactor needs power"); say2(n, "zorp is fun");
  assert.equal(n.say("teach me new words"), 'you have said "reactor" 2 times. what does reactor mean?');
  const ack = n.say("a power source");
  assert.ok(ack && !/^i do not know/.test(ack), ack);
  assert.equal(n.say("what is reactor"), "a power source");
  assert.ok(!("reactor" in idx(n)));
  assert.doesNotMatch(n.say("new words"), /reactor/);
  n.stop();
});

test("ask then skip leaves the word in the index", () => {
  const n = boot();
  say2(n, "zorp is fun");
  assert.equal(n.say("ask me a word"), 'you have said "zorp" 1 time. what does zorp mean?');
  assert.equal(n.say("skip"), "ok. skipped.");
  assert.equal(idx(n).zorp.count, 1);
  n.stop();
});

test("other teach paths remove the word: means, lock, when i say, what-is", () => {
  const n = boot();
  say2(n, "zorp is fun"); say2(n, "blip is fun"); say2(n, "quax is fun"); say2(n, "frob is fun");
  n.say("zorp means a made up word");
  n.say("lock blip as a tiny sound");
  n.say("when i say quax say a duck noise");
  assert.equal(n.say("what is frob"), "i do not know frob. what do you mean by it?");
  n.say("a tool");
  n.say("new words");
  const w = idx(n);
  for (const k of ["zorp", "blip", "quax", "frob"]) assert.ok(!(k in w), k + " should be learned");
  n.stop();
});

test("forget new words clears the index", () => {
  const n = boot();
  say2(n, "zorp is fun");
  assert.equal(n.say("forget new words"), "ok. new word list cleared.");
  assert.equal(n.say("new words"), "no new words yet.");
  n.stop();
});

test("replies unchanged with and without the index", () => {
  const lines = ["what is a glorp", "skip", "do you like snow", "yes", "what is 6 times 7",
    "If Jon has 4 cookies then Mary took 2, how many are left?", "when i say ping say pong", "ping",
    "cat means a small animal", "what is cat", "train status", "blorf wibble"];
  const a = boot();
  const b = boot({ files: ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js"] });
  for (const l of lines) assert.equal(a.say(l), b.say(l), l);
  a.stop(); b.stop();
});
