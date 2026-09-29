/* PR A: what is X / define X prefers the locked/user fact; lock drops stale what-is lessons. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

const ASKS = ["what is a photo", "what is a photo?", "What's a photo?", "whats a photo", "what is photo", "define photo"];

test("bug: lock photo as … then what is a photo returns the locked meaning, not the old lesson", () => {
  const n = boot();
  assert.equal(n.say("when i say what is a photo say an old picture"), "lesson saved.");
  assert.equal(n.say("when i say define photo say old lesson two"), "lesson saved.");
  assert.equal(n.say("when i say hello there say hi kevin"), "lesson saved.");
  assert.equal(n.say("what is a photo"), "an old picture");
  assert.equal(n.say("lock photo as a picture from a camera"), "locked photo.");
  for (const q of ASKS) assert.equal(n.say(q), "a picture from a camera", q);
  const keys = n.lessons().map((l) => l.user);
  assert.ok(!keys.includes("what is a photo") && !keys.includes("define photo"), "stale what-is lessons removed");
  assert.ok(keys.includes("hello there"), "unrelated lesson kept");
  assert.equal(n.say("hello there"), "hi kevin");
  assert.equal(n.T().status().lessons, n.lessons().length, "train.js memory in sync with storage");
  n.stop();
});

test("lock also drops what-is lessons taught through the IDK flow and they stay gone after persist + reload", () => {
  const n = boot();
  assert.equal(n.say("what is a photo"), "i do not know photo. what do you mean by it?");
  assert.equal(n.say("an old picture"), "got it. next time i'll say: an old picture");
  assert.equal(n.say("lock photo as a picture from a camera"), "locked photo.");
  /* Another correction makes train.js persist its in-memory lessons. */
  assert.equal(n.say("who painted my fence"), "i do not know.");
  assert.equal(n.say("say bob did"), "got it. next time i'll say: bob did");
  assert.ok(!n.lessons().some((l) => /photo/.test(l.user)), "no photo lesson resurrected");
  const seed = {};
  for (const k of ["nova-tiny-brain-v7", "nova-facts-v1"]) seed[k] = n.localStorage.getItem(k);
  n.stop();
  const again = boot({ seed });
  assert.equal(again.say("what is a photo"), "a picture from a camera");
  assert.equal(again.say("who painted my fence"), "bob did");
  again.stop();
});

test("user fact beats an older lesson even without lock (edit / means do not delete lessons)", () => {
  const n = boot();
  n.say("when i say what is a photo say an old picture");
  assert.equal(n.say("photo means a snapshot"), "saved your meaning.");
  assert.equal(n.say("what is a photo"), "a snapshot");
  assert.equal(n.say("edit photo as a print"), "updated your meaning of photo.");
  assert.equal(n.say("what is a photo?"), "a print");
  assert.equal(n.say("my photo"), "a print");
  n.stop();
});

test("math still wins over facts and lessons", () => {
  const n = boot();
  n.say("when i say what is 2 plus 2 say fish");
  assert.equal(n.say("what is 2 plus 2"), "4.");
  assert.equal(n.say("what is 50% of 80"), "40.");
  n.stop();
});

test("what is X with no fact still falls back to lessons, then honest unknown", () => {
  const n = boot();
  n.say("when i say what is a banana say a yellow fruit");
  assert.equal(n.say("what is a banana"), "a yellow fruit");
  assert.equal(n.say("what is your name"), "nova.");
  assert.equal(n.say("what is a zorp?"), "i do not know zorp. what do you mean by it?");
  n.stop();
});
