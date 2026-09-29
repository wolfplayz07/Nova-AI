/* Regression: owner commands and the corrections-after-IDK flow keep working. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

test("when i say A say B", () => {
  const n = boot();
  assert.equal(n.say("when i say hello there say hi kevin"), "lesson saved.");
  assert.equal(n.say("hello there"), "hi kevin");
  n.stop();
});

test("WORD means / edit / lock / my WORD", () => {
  const n = boot();
  assert.equal(n.say("cat means a small furry animal"), "saved your meaning.");
  assert.equal(n.say("what is a cat"), "a small furry animal");
  assert.equal(n.say("my cat"), "a small furry animal");
  assert.equal(n.say("edit cat as a pet that purrs"), "updated your meaning of cat.");
  assert.equal(n.say("what is cat"), "a pet that purrs");
  assert.equal(n.say("lock cat as a feline"), "locked cat.");
  assert.equal(n.say("what is cat"), "a feline");
  assert.equal(n.say("my cat"), "a pet that purrs", "my WORD returns the user slot only");
  n.stop();
});

test("read …", () => {
  const n = boot();
  assert.equal(n.say("read dog is a loyal animal that barks"), "saved 1 word.");
  assert.equal(n.say("what is a dog"), "a loyal animal that barks");
  n.stop();
});

test("start learning / stop learning", () => {
  const n = boot();
  assert.match(n.say("start learning"), /^Learning ON/);
  assert.match(n.say("stop learning"), /^Learning OFF/);
  n.stop();
});

test("unknown what-is asks, Skip cancels, answer teaches", () => {
  const n = boot();
  assert.equal(n.say("what is a quark"), "i do not know quark. what do you mean by it?");
  assert.equal(n.say("skip"), "ok. skipped.");
  assert.equal(n.say("what is a quark"), "i do not know quark. what do you mean by it?");
  assert.equal(n.say("a tiny particle"), "got it. next time i'll say: a tiny particle");
  assert.equal(n.say("what is a quark"), "a tiny particle");
  n.stop();
});

test("corrections after IDK and bare yes/no teach", () => {
  const n = boot();
  assert.equal(n.say("who painted my fence"), "i do not know.");
  assert.equal(n.say("say bob did"), "got it. next time i'll say: bob did");
  assert.equal(n.say("who painted my fence"), "bob did");
  assert.equal(n.say("can you swim"), "yes or no?");
  assert.equal(n.say("no"), "got it. next time i'll say: no");
  assert.equal(n.say("can you swim"), "no");
  n.stop();
});

test("remember I live in … / what do you remember", () => {
  const n = boot();
  assert.match(n.say("remember I live in Denver"), /^Got it\. Saved/);
  assert.match(n.say("what do you remember"), /Denver/);
  n.stop();
});

test("math and percent math stay first", () => {
  const n = boot();
  assert.equal(n.say("what is 2 plus 2"), "4.");
  assert.equal(n.say("what is 25% of 200"), "50.");
  assert.equal(n.say("10 percent of 50"), "5.");
  n.stop();
});

test("canned replies and honest unknown", () => {
  const n = boot();
  assert.equal(n.say("how are you"), "i am here.");
  assert.equal(n.say("do you live"), "yes. on this phone.");
  assert.equal(n.say("where is your home"), "on this phone.");
  assert.equal(n.say("are you alive"), "yes. on this phone.");
  assert.equal(n.say("why is the sky green"), "i do not know.");
  n.stop();
});
