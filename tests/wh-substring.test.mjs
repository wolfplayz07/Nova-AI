/* PR C: short question keys do not answer inside longer how/what/why questions. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

test("bug: How do you live? no longer answers yes. on this phone", () => {
  const n = boot();
  assert.equal(n.say("How do you live?"), "i do not know.");
  assert.equal(n.say("skip"), "ok. skipped.");
  assert.equal(n.say("what do you live on"), "i do not know.");
  assert.equal(n.say("why do you live here"), "i do not know.");
  assert.equal(n.say("why do you say how are you"), "i do not know.");
  n.stop();
});

test("exact home aliases and how are you still answer", () => {
  const n = boot();
  assert.equal(n.say("do you live"), "yes. on this phone.");
  assert.equal(n.say("Do you live?"), "yes. on this phone.");
  assert.equal(n.say("do you live here"), "yes. on this phone.");
  assert.equal(n.say("where is your home"), "on this phone.");
  assert.equal(n.say("where is your home?"), "on this phone.");
  assert.equal(n.say("where do you live?"), "on this phone.");
  assert.equal(n.say("are you alive"), "yes. on this phone.");
  assert.equal(n.say("how are you"), "i am here.");
  assert.equal(n.say("How are you?"), "i am here.");
  n.stop();
});

test("substring still works when the key starts the query or is not a question", () => {
  const n = boot();
  assert.equal(n.say("what is your name please"), "nova.");
  assert.equal(n.say("how are you doing today"), "i am here.");
  assert.equal(n.say("when i say your dog say rex"), "lesson saved.");
  assert.equal(n.say("what is your dog"), "rex");
  assert.equal(n.say("how about hello"), "hey.");
  n.stop();
});

test("a taught lesson for the long question works after the IDK", () => {
  const n = boot();
  assert.equal(n.say("how do you live"), "i do not know.");
  assert.equal(n.say("say by eating letters"), "got it. next time i'll say: by eating letters");
  assert.equal(n.say("how do you live"), "by eating letters");
  assert.equal(n.say("do you live"), "yes. on this phone.");
  n.stop();
});
