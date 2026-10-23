/* v48: "should I ..." asks for advice; it is not a yes/no question. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

test("QA repro: should i learn python or javascript first is not 'yes or no?'", () => {
  const n = boot();
  assert.equal(n.say("should i learn python or javascript first"), "i do not know.");
  assert.equal(n.say("should we go now?"), "i do not know.");
  assert.equal(n.say("skip"), "ok. skipped.");
  n.stop();
});

test("other yes/no shapes keep 'yes or no?' and the next line teaches", () => {
  const n = boot();
  for (const q of ["can you count", "should you be here", "is it raining", "do you like pizza"]) {
    assert.equal(n.say(q), "yes or no?", q);
    n.say("skip");
  }
  assert.equal(n.say("can you count"), "yes or no?");
  assert.equal(n.say("yes"), "got it. next time i'll say: yes");
  n.stop();
});

test("a 'should i' line can still be taught", () => {
  const n = boot();
  assert.equal(n.say("should i drink water"), "i do not know.");
  assert.match(n.say("yes, every day"), /^got it/);
  assert.equal(n.say("should i drink water"), "yes, every day");
  assert.equal(n.say("when i say should i run say yes"), "lesson saved.");
  assert.equal(n.say("should i run"), "yes");
  n.stop();
});
